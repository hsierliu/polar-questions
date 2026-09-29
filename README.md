# Polar Questions

This repository contains code for a blind-coding website and the analyses for our polar questions study. THe preregistration for this study can be found on [OSF](https://osf.io/fngb6). For context, the blind-coding website allows a researcher to upload videos and split them into segments, and other researchers to blind-code child responses and parent questions. Video segments and responses (in CSV format) are saved on Dropbox.

**Who to contact:** vgomes@fas.harvard.edu, hsierliu@fas.harvard.edu

> [!NOTE]
> Access to the website requires an authorized Google account. Please contact Hsi-Er to gain access and if you run into any issues! For any questions about the study itself, feel free to contact Victor and/or Hsi-Er.

## Repository structure

```text
pq-coding/
├── coding/                         # blind-coding website
│   ├── api/
│   │   └── dropbox.js              # server authentication, permissions, and Dropbox storage
│   ├── public/
│   │   └── pbear.png               # polar bear :) browser-tab icon
│   ├── src/
│   │   ├── App.jsx                 # app startup, uploader, coder, and admin interfaces
│   │   ├── index.css               # website styles and responsive layouts
│   │   └── services.js             # browser sign-in and server API requests
│   ├── index.html                  # HTML entry point and startup error fallback
│   ├── package.json                # dependencies and development commands
│   ├── package-lock.json           # exact dependency versions
│   └── vite.config.js              # React development and build settings
├── data-analysis/                  # study analyses (to be added)
│   └── .gitkeep                    # keeps the empty folder in Git (gonna remove this)
└── README.md                       # project overview and instructions
```


## Coding steps

**Gain access**

1. Ask Hsi-Er to add you as one of the following:
   - **ADMIN**: people who can use both the uploader and coder
   - **UPLOADER**: people who can only upload and segment videos
   - **CODER**: people who can only code videos
2. Open https://pq-coding.vercel.app/ on Chrome

**Upload videos**
1. Enter participant information (ID, age in months, order)
2. Upload the video file and use the timeline to split the video into segments:
   - Press "s" key or click "split at..." to create a split
   - Use spacebar to play/pause
   - Zoom in/out for precision
3. Assign each segment a type and pair. Press "play" to ensure the correct segment is selected.
   - **Type**: parent_question, child_response, or other
   - **Pair**: Which question this segment belongs to
4. Click "upload to dropbox" to save each video

**Code videos**
1. Select an un-coded session and click "load selected"
2. Click "start coding" to begin
3. For each video segment, answer the questions:
   - **Phase 1**: Child response questions
   - **Phase 2**: Parent question questions
3. Click "save to dropbox" to save the responses
