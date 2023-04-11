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
        videos.forEach((video) => {
          const row = document.createElement('tr');

          const filenameCell = document.createElement('td');
          filenameCell.textContent = video.filename;
          row.appendChild(filenameCell);

          const uploadTimeCell = document.createElement('td');
          uploadTimeCell.textContent = new Date(video.upload_time).toLocaleString();
          row.appendChild(uploadTimeCell);

          const playCell = document.createElement('td');
          const playButton = document.createElement('button');
          playButton.textContent = 'Play';
          playButton.addEventListener('click', () => {
            playVideo(video.sessionID, video.filename);
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

  function playVideo(sessionID, filename) {
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
  
  // Add stopUploadBtn click event listener
  stopUploadBtn.addEventListener('click', () => {
    isUploading = false;
    startUploadBtn.disabled = false;
    stopUploadBtn.disabled = true;
  });
  
  // Add captureAndUploadVideoChunkLoop function
  async function captureAndUploadVideoChunkLoop(sessionID) {
    sequenceNumber++;
    await captureAndUploadVideoChunk(sessionID, sequenceNumber);
  
    if (isUploading) {
      captureAndUploadVideoChunkLoop(sessionID);
    }
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
    const codec = "video/webm; codecs=vp9";
    const container = new MediaStream();
    container.addTrack(cameraPreview.srcObject.getVideoTracks()[0]);
  
    const mediaRecorder = new MediaRecorder(container, {
      mimeType: codec,
    });
  
    const chunks = [];
    mediaRecorder.ondataavailable = (event) => {
      if (event.data) {
        chunks.push(event.data);
      }
    };
  
    mediaRecorder.onstop = async () => {
      const blob = new Blob(chunks, { type: codec });
  
      const formData = new FormData();
      formData.append("video_chunk", blob);

      try {
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
    };

    mediaRecorder.start();
    await new Promise((resolve) => setTimeout(resolve, 3000));
    mediaRecorder.stop();
  }

  startCamera();
});