     // Initialize Firebase
     const firebaseConfig = {
        apiKey: "AIzaSyDB_ylrW7hartjCjSAqjjZjUoNSrSX7Et4",
        authDomain: "blogs-a7325.firebaseapp.com",
        databaseURL: "https://blogs-a7325-default-rtdb.firebaseio.com",
        projectId: "blogs-a7325",
        storageBucket: "blogs-a7325.appspot.com",
        messagingSenderId: "868013133674",
        appId: "1:868013133674:web:8ceaa7dfa63ee0d2a0df13",
        measurementId: "G-RJX09FKMMY"
    };
    
    firebase.initializeApp(firebaseConfig);
    const database = firebase.database();
    
    const configuration = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ]
    };
    
    let peerConnection;
    let localStream;
    let roomId;
    let isAudioMuted = false;
    let isVideoOff = false;
    
    // DOM elements
    const setupPanel = document.getElementById('setupPanel');
    const callPanel = document.getElementById('callPanel');
    const controlsPanel = document.getElementById('controls');
    const createButton = document.getElementById('createButton');
    const joinButton = document.getElementById('joinButton');
    const hangupButton = document.getElementById('hangupButton');
    const muteButton = document.getElementById('muteButton');
    const videoButton = document.getElementById('videoButton');
    const roomIdInput = document.getElementById('roomId');
    const localVideo = document.getElementById('localVideo');
    const remoteVideo = document.getElementById('remoteVideo');
    const statusDiv = document.getElementById('status');
    const errorDiv = document.getElementById('error');
    
    createButton.addEventListener('click', createRoom);
    joinButton.addEventListener('click', joinRoom);
    hangupButton.addEventListener('click', hangup);
    muteButton.addEventListener('click', toggleAudio);
    videoButton.addEventListener('click', toggleVideo);
    
    
    // Add this with your other global variables at the top of your script
    let backCam = 0; // 0 = front camera, 1 = back camera
    
    async function backCamera() {
        try {
            // Get current camera facing mode
            const currentFacingMode = backCam === 0 ? "user" : "environment";
            // Set new facing mode
            const newFacingMode = currentFacingMode === "user" ? "environment" : "user";
            
            // Create constraints for the new camera
            const constraints = {
                video: {
                    facingMode: { exact: newFacingMode } // Using exact for more reliable switching
                },
                audio: true // Maintain audio
            };
    
            // Get new stream
            const newStream = await navigator.mediaDevices.getUserMedia(constraints);
            
            // Stop all tracks from the old stream
            if (localStream) {
                localStream.getTracks().forEach(track => track.stop());
            }
    
            // Replace video track in the peer connection
            if (peerConnection) {
                const [videoTrack] = newStream.getVideoTracks();
                const senders = peerConnection.getSenders();
                const videoSender = senders.find(sender => sender.track?.kind === 'video');
                if (videoSender) {
                    await videoSender.replaceTrack(videoTrack);
                }
            }
    
            // Update local stream and video element
            localStream = newStream;
            localVideo.srcObject = newStream;
            
            // Toggle camera state
            backCam = backCam === 0 ? 1 : 0;
    
            // Maintain previous mute/video states
            if (isAudioMuted) {
                const audioTrack = localStream.getAudioTracks()[0];
                if (audioTrack) audioTrack.enabled = false;
            }
            if (isVideoOff) {
                const videoTrack = localStream.getVideoTracks()[0];
                if (videoTrack) videoTrack.enabled = false;
            }
    
            console.log(`Camera switched to ${newFacingMode} mode`);
    
        } catch (error) {
            console.error("Error switching camera:", error);
            
            // More specific error handling
            if (error.name === 'OverconstrainedError') {
                showError("Your device doesn't have a " + (backCam === 0 ? "back" : "front") + " camera");
            } else if (error.name === 'NotFoundError') {
                showError("No camera found on your device");
            } else if (error.name === 'NotAllowedError') {
                showError("Camera access denied. Please check your permissions");
            } else {
                showError("Failed to switch camera. Please try again");
            }
            
            // Reset backCam to previous state since switch failed
            backCam = backCam === 0 ? 1 : 0;
        }
    }
    
    async function createRoom() {
        try {
            roomId = roomIdInput.value || Math.random().toString(36).substring(7);
            roomIdInput.value = roomId;
    
            // Get local media stream
            localStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });
            localVideo.srcObject = localStream;
    
            // Create peer connection
            peerConnection = new RTCPeerConnection(configuration);
            setupPeerConnection();
    
            // Add local stream tracks to peer connection
            localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, localStream);
            });
    
            // Create and set local description
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
    
            // Save the offer to Firebase
            await database.ref(`rooms/${roomId}/offer`).set({
                type: offer.type,
                sdp: offer.sdp
            });
    
            // Listen for answer
            database.ref(`rooms/${roomId}/answer`).on('value', async snapshot => {
                const answer = snapshot.val();
                if (answer && !peerConnection.currentRemoteDescription) {
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
                }
            });
    
            showCallUI();
            setupControlVisibility();
            updateStatus('Room created! Share the Room ID: ' + roomId);
    
        } catch (error) {
            showError(`Error creating room: ${error.message}`);
        }
    }
    
    async function joinRoom() {
        try {
            roomId = roomIdInput.value;
            if (!roomId) {
                throw new Error('Please enter a room ID');
            }
    
            // Get local media stream
            localStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });
            localVideo.srcObject = localStream;
    
            // Get the offer from Firebase
            const snapshot = await database.ref(`rooms/${roomId}/offer`).get();
            const offer = snapshot.val();
            if (!offer) {
                throw new Error('Room not found');
            }
    
            // Create peer connection
            peerConnection = new RTCPeerConnection(configuration);
            setupPeerConnection();
    
            // Add local stream tracks to peer connection
            localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, localStream);
            });
    
            // Set remote description (offer)
            await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    
            // Create and set local description (answer)
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
    
            // Save the answer to Firebase
            await database.ref(`rooms/${roomId}/answer`).set({
                type: answer.type,
                sdp: answer.sdp
            });
    
            showCallUI();
            updateStatus('Connected to room: ' + roomId);
    
        } catch (error) {
            showError(`Error joining room: ${error.message}`);
        }
    }
    
    function setupPeerConnection() {
        // Handle ICE candidates
        peerConnection.onicecandidate = event => {
            if (event.candidate) {
                database.ref(`rooms/${roomId}/candidates/${Date.now()}`).set({
                    candidate: event.candidate.toJSON()
                });
            }
        };
    
        // Handle remote stream
        peerConnection.ontrack = event => {
            if (remoteVideo.srcObject !== event.streams[0]) {
                remoteVideo.srcObject = event.streams[0];
            }
        };
    
        // Listen for remote ICE candidates
        database.ref(`rooms/${roomId}/candidates`).on('child_added', snapshot => {
            const data = snapshot.val();
            if (data && data.candidate) {
                peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
            }
        });
    }
    
    function toggleAudio() {
        if (localStream) {
            const audioTrack = localStream.getAudioTracks()[0];
            if (audioTrack) {
                isAudioMuted = !isAudioMuted;
                audioTrack.enabled = !isAudioMuted;
                muteButton.innerHTML = isAudioMuted ? `<i class="fa-solid fa-microphone-slash fa-xl" style="color: #ff2e2e;"></i>` : `<i class="fa-solid fa-microphone fa-xl" style="color: rgb(0, 145, 255);"></i>`;
                muteButton.classList.toggle('active', isAudioMuted);
            }
        }
    }
    
    function toggleVideo() {
        if (localStream) {
            const videoTrack = localStream.getVideoTracks()[0];
            if (videoTrack) {
                isVideoOff = !isVideoOff;
                videoTrack.enabled = !isVideoOff;
                videoButton.innerHTML = isVideoOff ? `<i class="fa-solid fa-video-slash fa-xl" style="color: #ff1f1f;"></i>` : `<i class="fa-solid fa-video fa-xl" style="color: #00ff9d;"></i>`;
                videoButton.classList.toggle('active', isVideoOff);
            }
        }
    }
    
    function hangup() {
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
        }
        
        if (peerConnection) {
            peerConnection.close();
        }
    
        if (roomId) {
            database.ref(`rooms/${roomId}`).remove();
        }
    
        // Reset variables
        localStream = null;
        peerConnection = null;
        roomId = null;
        isAudioMuted = false;
        isVideoOff = false;
    
        // Reset UI
        localVideo.srcObject = null;
        remoteVideo.srcObject = null;
        hideCallUI();
        updateStatus('Call ended');
        roomIdInput.value = '';
    }
    
    function showCallUI() {
        setupPanel.classList.add('hidden');
        callPanel.classList.remove('hidden');
        controlsPanel.classList.remove('hidden');
    }
    
    function hideCallUI() {
        setupPanel.classList.remove('hidden');
        callPanel.classList.add('hidden');
        controlsPanel.classList.add('hidden');
    }
    
    function updateStatus(message) {
        statusDiv.textContent = message;
        errorDiv.classList.add('hidden');
    }
    
    function showError(message) {
        errorDiv.textContent = message;
        errorDiv.classList.remove('hidden');
    }
    
    // Clean up when the page is closed
    window.addEventListener('beforeunload', hangup);
