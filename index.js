const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const MP4Box = require('mp4box');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffprobePath = require('@ffprobe-installer/ffprobe').path;
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const { exec } = require('child_process');

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const app = express();
const port = 3000;

app.use(express.static('public'));
app.use(express.static('public', { extensions: ['html', 'css', 'js'] }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const videoMetadataFile = 'video_metadata.json';

function readVideoMetadata(callback) {
  fs.readFile(videoMetadataFile, (err, data) => {
    if (err) {
      callback(err, null);
    } else {
      callback(null, JSON.parse(data));
    }
  });
}

function writeVideoMetadata(metadata, callback) {
  fs.writeFile(videoMetadataFile, JSON.stringify(metadata), (err) => {
    if (err) {
      callback(err);
    } else {
      callback(null);
    }
  });
}


function convertToDASH(inputFile, outputFilename, sessionID, callback) {
  const mp4Output = outputFilename;
  const dashOutput = path.join(path.dirname(inputFile), 'dash');
  fs.mkdirSync(dashOutput, { recursive: true });

  ffmpeg(inputFile)
    .outputOptions(['-c:v libvpx-vp9', '-b:v 5000k', '-bufsize 5000k', '-vf scale=1280:720', '-r 30'])
    .save(mp4Output)
    .on('end', () => {
      const mpdFile = path.join(dashOutput, 'index.mpd');
      const mp4boxCommand = `MP4Box -dash 1000 -rap -frag-rap -profile live -out ${mpdFile} ${mp4Output}`;

      exec(mp4boxCommand, (error, stdout, stderr) => {
        if (error) {
          console.error(`Error executing MP4Box: ${error}`);
        } else {
          console.log(`MP4Box output: ${stdout}`);
          callback();
        }
      });
    })
    .on('error', (err) => {
      console.error(`FFmpeg error: ${err.message}`);
    });
}



const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    console.log('Session ID: ', req.headers.sessionid)
    const sessionPath = path.join(__dirname, 'uploads', req.headers.sessionid);
    fs.mkdirSync(sessionPath, { recursive: true });
    cb(null, sessionPath);
  },
  filename: (req, file, cb) => {
    cb(null, file.fieldname + '-' + req.headers.sequence_number + path.extname(file.originalname));
  },
});

const upload = multer({ storage: storage });


app.post('/upload', upload.single('video_chunk'), (req, res) => {
  const sessionID = req.headers.sessionid;
  const inputFile = req.file.path;
  const outputFilename = path.join(path.dirname(inputFile), path.basename(inputFile, path.extname(inputFile)) + '.mp4');


  convertToDASH(inputFile, outputFilename, sessionID, (error) => {
    if (error) {
      res.status(500).send('Error converting video to MP4');
    } else {
      const videoMetadata = {
        filename: outputFilename,
        upload_time: new Date().toISOString(),
        sessionID: sessionID,
      };

      readVideoMetadata((error, metadata) => {
        if (error) {
          res.status(500).send('Error reading video metadata');
        } else {
          metadata.push(videoMetadata);
          writeVideoMetadata(metadata, (err) => {
            if (err) {
              res.status(500).send('Error saving metadata');
            } else {
              res.status(200).send('Video uploaded and converted to MP4 successfully');
            }
          });
        }
      });
    }
  });
});

app.get('/videos', (req, res) => {
  readVideoMetadata((error, metadata) => {
    if (error) {
      res.status(500).send('Error retrieving video list');
    } else {
      res.status(200).json(metadata);
    }
  });
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

