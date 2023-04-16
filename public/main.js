document.addEventListener('DOMContentLoaded', () => {
  const videoList = document.getElementById('video-list');
  const startUploadBtn = document.getElementById('start-upload');
  const cameraPreview = document.getElementById('camera-preview');
  const videoPlayerContainer = document.getElementById('video-player-container');
  const stopUploadBtn = document.getElementById('stop-upload');
  let isUploading = false;
  let sessionID = null;
  let sequenceNumber = 0;

  function updateVideoList() {
    fetch('/videos')
      .then((response) => {
        if (response.ok) {
          return response.json();
        } else {
          throw new Error('Failed to retrieve video list');
        }
      })
      .then((videos) => {
        const tbody = videoList.querySelector('tbody');
        tbody.innerHTML = '';
  
        // Group videos by sessionID
        const groupedVideos = videos.reduce((acc, video) => {
          if (!acc[video.sessionID]) {
            acc[video.sessionID] = [];
          }
          acc[video.sessionID].push(video);
          return acc;
        }, {});
  
        // Display only one row for each sessionID
        Object.values(groupedVideos).forEach((group) => {
          const video = group[0]; // Use the first video chunk in the group to display information
          const row = document.createElement('tr');
  
          const folderCell = document.createElement('td');
          folderCell.textContent = `Session ID: ${video.sessionID}`;
          row.appendChild(folderCell);
  
          const uploadTimeCell = document.createElement('td');
          uploadTimeCell.textContent = new Date(video.upload_time).toLocaleString();
          row.appendChild(uploadTimeCell);
  
          const playCell = document.createElement('td');
          const playButton = document.createElement('button');
          playButton.textContent = 'Play';
          playButton.addEventListener('click', () => {
            playVideo(video.sessionID);
          });
          playCell.appendChild(playButton);
          row.appendChild(playCell);
  
          tbody.appendChild(row);
        });
      })
      .catch((error) => {
        console.error('Error:', error);
      });
  }
  

  function playVideo(sessionID) {
    const videoUrl = `/uploads/${sessionID}/dash/index.mpd`;
    videoPlayerContainer.innerHTML = `
      <video id="video-player" width="640" height="360" controls></video>
    `;
    const videoPlayer = document.getElementById('video-player');
    const player = dashjs.MediaPlayer().create();
    player.initialize(videoPlayer, videoUrl, true);
  }
  
  

  startUploadBtn.addEventListener('click', () => {
    if (!sessionID) {
      sessionID = Date.now().toString();
    }
    
    isUploading = true;
    startUploadBtn.disabled = true;
    stopUploadBtn.disabled = false;
    captureAndUploadVideoChunkLoop(sessionID);
  });
  
  stopUploadBtn.addEventListener('click', () => {
    isUploading = false;
    startUploadBtn.disabled = false;
    stopUploadBtn.disabled = true;
  });

  async function captureAndUploadVideoChunkLoop(sessionID) {
    let startTimestamp = performance.now();
    let lastCaptureTimestamp = startTimestamp;

    const capture = async (timestamp) => {
      if (!isUploading) {
        return;
      }

      if (timestamp - lastCaptureTimestamp >= 3000) {
        sequenceNumber++;
        await captureAndUploadVideoChunk(sessionID, sequenceNumber);
        lastCaptureTimestamp = timestamp;
      }

      requestAnimationFrame(capture);
    };

    requestAnimationFrame(capture);
  }
  
  async function startCamera() {
    const constraints = {
      audio: false,
      video: {
        width: 1280,
        height: 720,
        frameRate: 30,
      },
    };
  
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      cameraPreview.srcObject = stream;
    } catch (error) {
      console.error("Error accessing the camera:", error);
    }
  }
  
  async function captureAndUploadVideoChunk(sessionID, sequenceNumber) {
    const codec = "video/webm; codecs=vp8";
    const container = new MediaStream();
    container.addTrack(cameraPreview.srcObject.getVideoTracks()[0]);
  
    const mediaRecorder = new MediaRecorder(container, {
      mimeType: codec,
      videoBitsPerSecond: 5000000,
    });
  
    const chunks = [];
    mediaRecorder.ondataavailable = async (event) => {
      if (event.data) {
        chunks.push(event.data);
        
        const blob = new Blob(chunks, { type: codec });
  
        const formData = new FormData();
        formData.append("video_chunk", blob);
  
        try {
          console.log('Uploading sequence number:', sequenceNumber); // Add this line
          const response = await axios.post("http://localhost:3000/upload", formData, {
            headers: {
              'Content-Type': 'multipart/form-data',
              'sessionid': sessionID,
              'sequence_number': sequenceNumber
            },
          });
  
          if (response.status !== 200) {
            throw new Error("Failed to upload video");
          }
  
          console.log("Video chunk uploaded successfully");
          updateVideoList();
        } catch (error) {
          console.error("Error:", error);
        }
      }
    };
  
    mediaRecorder.start(3000);
    setTimeout(() => {
      mediaRecorder.stop();
    }, 3000);
  }
  
  
  

  startCamera();
  updateVideoList();
});