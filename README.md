# Polar Questions

This repository contains materials used in our polar questions study, code for a blind-coding website, and the analyses we ran. The preregistration for this study can be found on [OSF](https://osf.io/fngb6). 

**Who to contact:** hsierliu@fas.harvard.edu, vgomes@fas.harvard.edu

> [!NOTE]
> Access to the coding website requires an authorized Google account. Please contact Hsi-Er to gain access and if you run into any issues! For any questions about the study itself, feel free to contact Victor and Hsi-Er.

## Repository structure

```text
polar-questions/
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
├── data-analysis/                  # study analyses and data
│   ├── analysis.Rmd                # analysis code
│   ├── analysis.md                 # !! viewable analysis
│   ├── initialD.csv                # first-coder dataset
│   ├── secondD.csv                 # second-coder dataset
│   ├── finalD.csv                  # final dataset (first-coder)
│   ├── mainFig.png                 # main figure for BUCLD: verbal responses and gestures
│   └── other-figures/              # figures used in the analysis md file
├── materials/                      # study materials
│   ├── books - order 1 and 2.pdf   # stimulus books for orders 1 and 2
│   ├── books - order 3 and 4.pdf   # stimulus books for orders 3 and 4
│   └── coding questions.pdf        # coding questions
└── BUCLD51_Poster.pdf              # BUCLD 51 poster
```


## Coding steps

**Gain access**

1. Ask Hsi-Er to add you as one of the following:
   - **ADMIN**: can see the progress of each coder and do both uploader/coder actions
   - **UPLOADER**: can only upload and segment videos
   - **CODER**: can only code videos
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
3. For each video segment, answer the questions. There are a total of two phases.
   - **Phase 1**: Child response questions
   - **Phase 2**: Parent question questions
4. Click "save to dropbox" to save your coded responses
