// Initialize Firebase
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, get, remove, onValue, child } from 'firebase/database';

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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

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

let backCam = 0; // 0 = front camera, 1 = back camera

async function backCamera() {
    try {
        const currentFacingMode = backCam === 0 ? "user" : "environment";
        const newFacingMode = currentFacingMode === "user" ? "environment" : "user";
        
        const constraints = {
            video: {
                facingMode: { exact: newFacingMode }
            },
            audio: true
        };

        const newStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
        }

        if (peerConnection) {
            const [videoTrack] = newStream.getVideoTracks();
            const senders = peerConnection.getSenders();
            const videoSender = senders.find(sender => sender.track?.kind === 'video');
            if (videoSender) {
                await videoSender.replaceTrack(videoTrack);
            }
        }

        localStream = newStream;
        localVideo.srcObject = newStream;
        
        backCam = backCam === 0 ? 1 : 0;

        if (isAudioMuted) {
            const audioTrack = localStream.getAudioTracks()[0];
            if (audioTrack) audioTrack.enabled = false;
        }
        if (isVideoOff) {
            const videoTrack = localStream.getVideoTracks()[0];
            if (videoTrack) videoTrack.enabled = false;
        }

    } catch (error) {
        console.error("Error switching camera:", error);
        
        if (error.name === 'OverconstrainedError') {
            showError("Your device doesn't have a " + (backCam === 0 ? "back" : "front") + " camera");
        } else if (error.name === 'NotFoundError') {
            showError("No camera found on your device");
        } else if (error.name === 'NotAllowedError') {
            showError("Camera access denied. Please check your permissions");
        } else {
            showError("Failed to switch camera. Please try again");
        }
        
        backCam = backCam === 0 ? 1 : 0;
    }
}

async function createRoom() {
    try {
        roomId = roomIdInput.value || Math.random().toString(36).substring(7);
        roomIdInput.value = roomId;

        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });
        localVideo.srcObject = localStream;

        peerConnection = new RTCPeerConnection(configuration);
        setupPeerConnection();

        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        await set(ref(database, `rooms/${roomId}/offer`), {
            type: offer.type,
            sdp: offer.sdp
        });

        onValue(ref(database, `rooms/${roomId}/answer`), async snapshot => {
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

        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });
        localVideo.srcObject = localStream;

        const snapshot = await get(ref(database, `rooms/${roomId}/offer`));
        const offer = snapshot.val();
        if (!offer) {
            throw new Error('Room not found');
        }

        peerConnection = new RTCPeerConnection(configuration);
        setupPeerConnection();

        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });

        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        await set(ref(database, `rooms/${roomId}/answer`), {
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
    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            set(ref(database, `rooms/${roomId}/candidates/${Date.now()}`), {
                candidate: event.candidate.toJSON()
            });
        }
    };

    peerConnection.ontrack = event => {
        if (remoteVideo.srcObject !== event.streams[0]) {
            remoteVideo.srcObject = event.streams[0];
        }
    };

    onValue(ref(database, `rooms/${roomId}/candidates`), snapshot => {
        snapshot.forEach(childSnapshot => {
            const data = childSnapshot.val();
            if (data && data.candidate) {
                peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
            }
        });
    });
}

function toggleAudio() {
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            isAudioMuted = !isAudioMuted;
            audioTrack.enabled = !isAudioMuted;
            muteButton.innerHTML = isAudioMuted ? 
                `<i class="fa-solid fa-microphone-slash fa-xl" style="color: #ff2e2e;"></i>` : 
                `<i class="fa-solid fa-microphone fa-xl" style="color: rgb(0, 145, 255);"></i>`;
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
            videoButton.innerHTML = isVideoOff ? 
                `<i class="fa-solid fa-video-slash fa-xl" style="color: #ff1f1f;"></i>` : 
                `<i class="fa-solid fa-video fa-xl" style="color: #00ff9d;"></i>`;
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
        remove(ref(database, `rooms/${roomId}`));
    }

    localStream = null;
    peerConnection = null;
    roomId = null;
    isAudioMuted = false;
    isVideoOff = false;

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

window.addEventListener('beforeunload', hangup);
