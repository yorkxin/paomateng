/**
* Create a WaveSurfer instance.
*/
let wavesurfer;

/** @type {HTMLDivElement} */
let cuesContainer;
let audioFileInput;
let templateOfCueItem;
let videoPreview;
let audioInPreview;
let subtitlesInPreview;

// the following colors are from Bootstrap 4 background color with alpha
const REGION_COLOR_PRIMARY = 'rgba(0, 123, 255, 0.3)';
const REGION_COLOR_SECONDARY = 'rgba(108, 117, 125, 0.3)';

// from: https://github.com/you-dont-need/You-Dont-Need-Lodash-Underscore#_debounce
function debounce(func, wait, immediate) {
  var timeout;
  return function() {
  	var context = this, args = arguments;
  	clearTimeout(timeout);
  	timeout = setTimeout(function() {
  		timeout = null;
  		if (!immediate) func.apply(context, args);
  	}, wait);
  	if (immediate && !timeout) func.apply(context, args);
  };
}

document.addEventListener('DOMContentLoaded', function () {
  templateOfCueItem = document.getElementById('template-cue-item');
  cuesContainer = document.getElementById('cues');
  audioFileInput = document.getElementById('audio-file');

  // Preview Area
  videoPreview = document.getElementById('video-preview');
  audioInPreview = document.getElementById('audio-in-preview');
  subtitlesInPreview = document.getElementById('subtitles-in-preview');

  document.getElementById('open-audio-file').addEventListener('click', () => {
    audioFileInput.click();
  })

  audioFileInput.addEventListener('change', function(event) {
    const file = audioFileInput.files[0];

    if (file) {
      const blob = URL.createObjectURL(file);
      wavesurfer.load(blob);
      audioInPreview.src = blob;
      audioInPreview.type = file.type;
      videoPreview.load();
    } else {
      // TODO: clearAudio()
    }
  });

  // Init wavesurfer
  wavesurfer = WaveSurfer.create({
    container: '#waveform',
    height: 100,
    pixelRatio: 1,
    scrollParent: true,
    normalize: true,
    minimap: true,
    plugins: [
      WaveSurfer.regions.create({
        loop: true
      }),
      WaveSurfer.minimap.create({
        height: 30,
        waveColor: '#ddd',
        progressColor: '#999',
        cursorColor: '#999'
      }),
      WaveSurfer.timeline.create({
        container: '#wave-timeline'
      })
    ]
  });

  /* Regions */
  wavesurfer.on('ready', function () {
    wavesurfer.enableDragSelection({
      color: REGION_COLOR_SECONDARY
    });
  });

  wavesurfer.on('region-click', function (region, e) {
    e.stopPropagation();
    region.play();
  });

  // wavesurfer.on('region-click', editAnnotation);
  wavesurfer.on('region-created', function (region) {
    const clone = templateOfCueItem.content.cloneNode(true);
    const cueItem = clone.firstElementChild;
    cuesContainer.appendChild(cueItem);
    cueItem.id = `cue-${region.id}`;
    cueItem.dataset['region_id'] = region.id;

    cueItem.querySelector('[data-ref=play]').addEventListener('click', (event) => {
      event.preventDefault();
      region.play();
    });

    cueItem.querySelector('[data-ref=delete]').addEventListener('click', (event) => {
      event.preventDefault();
      region.remove();
    });

    const textInput = cueItem.querySelector('[data-ref=input]')
    textInput.id = `cue-text-input-${region.id}`;
    textInput.addEventListener('change', () => updateVTT());
    updateCueListItem(cueItem, region);
    bobbleUpCueListItem(cueItem);
  });

  wavesurfer.on('region-updated', function (region) {
    const cueItem = document.getElementById(`cue-${region.id}`);
    updateCueListItem(cueItem, region);
    bobbleUpCueListItem(cueItem);
    updateVTT();
  });

  wavesurfer.on('region-removed', function (region) {
    const cueItem = document.getElementById(`cue-${region.id}`);
    cuesContainer.removeChild(cueItem);
    updateVTT();
  });

  wavesurfer.on('region-in', function (region) {
    highlightRegion(region);
  });

  wavesurfer.on('region-out', function (region) {
    deemphasizeRegion(region);
  });

  /* Toggle play/pause buttons. */
  var playPauseButton = document.querySelector('#play-pause-button');

  wavesurfer.on('play', async function () {
    playPauseButton.textContent = "⏸️";
    videoPreview.currentTime = wavesurfer.getCurrentTime();
    await videoPreview.play();
  });
  wavesurfer.on('pause', function () {
    playPauseButton.textContent = "▶️";
    videoPreview.pause();
  });

  wavesurfer.on('seek', function() {
    videoPreview.currentTime = wavesurfer.getCurrentTime();

    Object.values(wavesurfer.regions.list).map(function (region) {
      deemphasizeRegion(region);
    });

    const region = wavesurfer.regions.getCurrentRegion();

    if (region) {
      highlightRegion(region);
    }
  })

  playPauseButton.addEventListener('click', (event) => {
    if (wavesurfer.isPlaying()) {
      wavesurfer.pause();
    } else {
      wavesurfer.play();
    }
  });
});

function updateCueListItem(cueItem, region) {
  cueItem.dataset['region_start'] = region.start;
  cueItem.querySelector('.editor-cue-start').innerText = formatTime(region.start);
  cueItem.querySelector('.editor-cue-end').innerText = formatTime(region.end);
}

function formatTime(timestamp) {
  const minutes = Math.floor(timestamp / 60).toString().padStart(2, '0');
  const seconds = (timestamp % 60).toFixed(3).toString().padStart(6, '0');
  return `${minutes}:${seconds}`;
}

// NOTE: this function assumes that the cue container is already sorted,
// just the element in question is not in the right place (presumably at the end of list).
function bobbleUpCueListItem(cueItemToReorder) {
  const cueContainer = cueItemToReorder.parentNode;

  if (!cueContainer) {
    console.error('Cue List Item is not under a cue container. Cannot sort.')
    return;
  }

  const myTimestamp = parseFloat(cueItemToReorder.dataset['region_start'], 10);

  // search upwards
  let cursor = cueItemToReorder.previousElementSibling;

  while (cursor !== null) {
    const prevTimestamp = parseFloat(cursor.dataset['region_start'], 10);

    if (prevTimestamp > myTimestamp) {
      cueContainer.insertBefore(cueItemToReorder, cursor);
      break;
    }

    cursor = cursor.previousElementSibling;
  }

  // search downwards
  cursor = cueItemToReorder.nextElementSibling;

  while (cursor !== null) {
    const nextTimestamp = parseFloat(cursor.dataset['region_start'], 10);

    if (nextTimestamp < myTimestamp) {
      cueContainer.insertBefore(cursor, cueItemToReorder);
      break;
    }

    cursor = cursor.nextElementSibling;
  }
}

function highlightRegion(region) {
  const cueItem = document.getElementById(`cue-${region.id}`);
  cueItem.classList.add('table-primary');
  region.update({ color: REGION_COLOR_PRIMARY });
}

function deemphasizeRegion(region) {
  const cueItem = document.getElementById(`cue-${region.id}`);
  cueItem.classList.remove('table-primary');
  region.update({ color: REGION_COLOR_SECONDARY });
}

function actuallyUpdateVTT() {
  const cues = Object.values(wavesurfer.regions.list).map(region => {
    const text = document.getElementById(`cue-text-input-${region.id}`).value;
    return `${formatTime(region.start)} --> ${formatTime(region.end)}\n${text}`;
  })

  const vttText = ["WEBVTT", ...cues].join("\n\n");
  const blob = new Blob([vttText], { type: 'text/vtt' });
  const url = URL.createObjectURL(blob);
  subtitlesInPreview.src = url;
}

const updateVTT = debounce(actuallyUpdateVTT, 500);

// All Code Below Are From Official Demo, for reference, keep as needed ------------------------------
// http://wavesurfer-js.org/example/annotation/index.html

/**
* Save annotations to localStorage.
*/
function saveRegions() {
  localStorage.regions = JSON.stringify(
    Object.keys(wavesurfer.regions.list).map(function (id) {
      var region = wavesurfer.regions.list[id];
      return {
        start: region.start,
        end: region.end,
        attributes: region.attributes,
        data: region.data
      };
    })
  );
}
/**
* Load regions from localStorage.
*/
function loadRegions(regions) {
  regions.forEach(function (region) {
    wavesurfer.addRegion(region);
  });
}

/**
* Extract regions separated by silence.
*/
function extractRegions(peaks, duration) {
  // Silence params
  var minValue = 0.0015;
  var minSeconds = 0.25;

  var length = peaks.length;
  var coef = duration / length;
  var minLen = minSeconds / coef;

  // Gather silence indeces
  var silences = [];
  Array.prototype.forEach.call(peaks, function (val, index) {
    if (Math.abs(val) <= minValue) {
      silences.push(index);
    }
  });

  // Cluster silence values
  var clusters = [];
  silences.forEach(function (val, index) {
    if (clusters.length && val == silences[index - 1] + 1) {
      clusters[clusters.length - 1].push(val);
    } else {
      clusters.push([val]);
    }
  });

  // Filter silence clusters by minimum length
  var fClusters = clusters.filter(function (cluster) {
    return cluster.length >= minLen;
  });

  // Create regions on the edges of silences
  var regions = fClusters.map(function (cluster, index) {
    var next = fClusters[index + 1];
    return {
      start: cluster[cluster.length - 1],
      end: next ? next[0] : length - 1
    };
  });

  // Add an initial region if the audio doesn't start with silence
  var firstCluster = fClusters[0];
  if (firstCluster && firstCluster[0] != 0) {
    regions.unshift({
      start: 0,
      end: firstCluster[firstCluster.length - 1]
    });
  }

  // Filter regions by minimum length
  var fRegions = regions.filter(function (reg) {
    return reg.end - reg.start >= minLen;
  });

  // Return time-based regions
  return fRegions.map(function (reg) {
    return {
      start: Math.round(reg.start * coef * 10) / 10,
      end: Math.round(reg.end * coef * 10) / 10
    };
  });
}

/**
* Bind controls.
*/

window.GLOBAL_ACTIONS['export'] = function () {
  window.open(
    'data:application/json;charset=utf-8,' +
    encodeURIComponent(localStorage.regions)
  );
};
