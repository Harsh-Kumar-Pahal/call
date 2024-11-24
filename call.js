 // Firebase Configuration
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
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.database(app);

// WebRTC Configuration with TURN servers
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        {
            urls: 'turn:numb.viagenie.ca',
            username: 'webrtc@live.com',
            credential: 'muazkh'
        },
        {
            urls: 'turn:turn.anyfirewall.com:443?transport=tcp',
            username: 'webrtc',
            credential: 'webrtc'
        }
    ],
    iceCandidatePoolSize: 10,
};

// Global variables
let peerConnection;
let localStream;
let screenStream;
let currentRoom;
let isVideoEnabled = true;
let isAudioEnabled = true;
let isScreenSharing = false;

// DOM Elements
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const toggleVideoBtn = document.getElementById('toggleVideo');
const toggleAudioBtn = document.getElementById('toggleAudio');
const toggleScreenBtn = document.getElementById('toggleScreen');
const joinRoomBtn = document.getElementById('joinRoom');
const endCallBtn = document.getElementById('endCall');
const roomIdDisplay = document.getElementById('roomId');
const copyRoomBtn = document.getElementById('copyRoom');
const loadingElement = document.getElementById('loading');
const remoteStatus = document.getElementById('remoteStatus');

// Toast notification function
function showToast(message, duration = 3000) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.style.display = 'block';
    setTimeout(() => {
        toast.style.display = 'none';
    }, duration);
}

// Generate random room ID
function generateRoomId() {
    return Math.random().toString(36).substring(2, 15);
}

// Initialize media stream
async function initializeStream() {
    try {
        loadingElement.style.display = 'flex';
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });
        localVideo.srcObject = localStream;
        loadingElement.style.display = 'none';
    } catch (error) {
        console.error('Error accessing media devices:', error);
        showToast('Error accessing camera/microphone. Please check permissions.');
        loadingElement.style.display = 'none';
    }
}

// Create or join room
async function createOrJoinRoom() {
    try {
        const roomId = prompt('Enter room ID or leave empty to create new room:');
        currentRoom = roomId || generateRoomId();
        roomIdDisplay.textContent = currentRoom;
        
        const roomRef = db.ref(`rooms/${currentRoom}`);
        const roomSnapshot = await roomRef.once('value');
        
        if (roomSnapshot.exists()) {
            joinRoom(currentRoom);
        } else {
            createRoom(currentRoom);
        }
    } catch (error) {
        console.error('Error creating/joining room:', error);
        showToast('Error connecting to room. Please try again.');
    }
}

// Create new room
async function createRoom(roomId) {
    peerConnection = new RTCPeerConnection(configuration);
    registerPeerConnectionListeners();

    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    const roomRef = db.ref(`rooms/${roomId}`);
    const offerCandidates = roomRef.child('offerCandidates');
    const answerCandidates = roomRef.child('answerCandidates');

    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            offerCandidates.push(JSON.stringify(event.candidate));
        }
    };

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    await roomRef.set({
        offer: { sdp: offer.sdp, type: offer.type }
    });

    roomRef.child('answer').on('value', async snapshot => {
        const answer = snapshot.val();
        if (answer && !peerConnection.currentRemoteDescription) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        }
    });

    answerCandidates.on('child_added', async snapshot => {
        const candidate = JSON.parse(snapshot.val());
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    });

    showToast('Room created! Share the room ID with others to join.');
}

// Join existing room
async function joinRoom(roomId) {
    const roomRef = db.ref(`rooms/${roomId}`);
    const roomSnapshot = await roomRef.once('value');

    if (!roomSnapshot.exists()) {
        showToast('Room does not exist!');
        return;
    }

    peerConnection = new RTCPeerConnection(configuration);
    registerPeerConnectionListeners();

    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    const offer = roomSnapshot.val().offer;
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    await roomRef.child('answer').set({
        type: answer.type,
        sdp: answer.sdp
    });

    roomRef.child('offerCandidates').on('child_added', async snapshot => {
        const candidate = JSON.parse(snapshot.val());
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    });

    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            roomRef.child('answerCandidates').push(JSON.stringify(event.candidate));
        }
    };
}

// Register peer connection listeners
function registerPeerConnectionListeners() {
    peerConnection.ontrack = event => {
        remoteVideo.srcObject = event.streams[0];
        remoteStatus.innerHTML = '<i class="fas fa-circle text-green-500"></i> Connected';
    };

    peerConnection.onconnectionstatechange = () => {
        // Continuing from the previous registerPeerConnectionListeners function...

    switch (peerConnection.connectionState) {
        case 'connected':
            showToast('Connected to peer!');
            remoteStatus.innerHTML = '<i class="fas fa-circle text-green-500"></i> Connected';
            break;
        case 'disconnected':
            showToast('Peer disconnected');
            remoteStatus.innerHTML = '<i class="fas fa-circle text-red-500"></i> Disconnected';
            break;
        case 'failed':
            showToast('Connection failed. Trying to reconnect...');
            remoteStatus.innerHTML = '<i class="fas fa-circle text-red-500"></i> Failed';
            handleConnectionFailure();
            break;
        case 'closed':
            showToast('Connection closed');
            remoteStatus.innerHTML = '<i class="fas fa-circle text-gray-500"></i> Closed';
            break;
    }
};

peerConnection.oniceconnectionstatechange = () => {
    if (peerConnection.iceConnectionState === 'failed') {
        peerConnection.restartIce();
    }
};
}

// Handle connection failure
async function handleConnectionFailure() {
try {
    await peerConnection.restartIce();
    const offer = await peerConnection.createOffer({ iceRestart: true });
    await peerConnection.setLocalDescription(offer);
    
    if (currentRoom) {
        await db.ref(`rooms/${currentRoom}/offer`).set({
            type: offer.type,
            sdp: offer.sdp
        });
    }
} catch (error) {
    console.error('Error during connection recovery:', error);
    showToast('Failed to recover connection. Please rejoin the room.');
}
}

// Toggle video
toggleVideoBtn.addEventListener('click', () => {
isVideoEnabled = !isVideoEnabled;
localStream.getVideoTracks().forEach(track => {
    track.enabled = isVideoEnabled;
});
toggleVideoBtn.innerHTML = isVideoEnabled ? 
    '<i class="fas fa-video"></i>' : 
    '<i class="fas fa-video-slash"></i>';
toggleVideoBtn.classList.toggle('bg-red-600', !isVideoEnabled);
toggleVideoBtn.classList.toggle('bg-gray-700', isVideoEnabled);
showToast(`Video ${isVideoEnabled ? 'enabled' : 'disabled'}`);
});

// Toggle audio
toggleAudioBtn.addEventListener('click', () => {
isAudioEnabled = !isAudioEnabled;
localStream.getAudioTracks().forEach(track => {
    track.enabled = isAudioEnabled;
});
toggleAudioBtn.innerHTML = isAudioEnabled ? 
    '<i class="fas fa-microphone"></i>' : 
    '<i class="fas fa-microphone-slash"></i>';
toggleAudioBtn.classList.toggle('bg-red-600', !isAudioEnabled);
toggleAudioBtn.classList.toggle('bg-gray-700', isAudioEnabled);
showToast(`Audio ${isAudioEnabled ? 'enabled' : 'disabled'}`);
});

// Toggle screen sharing
toggleScreenBtn.addEventListener('click', async () => {
try {
    if (!isScreenSharing) {
        screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: true
        });
        
        const videoTrack = screenStream.getVideoTracks()[0];
        const sender = peerConnection.getSenders().find(s => 
            s.track.kind === 'video'
        );
        
        await sender.replaceTrack(videoTrack);
        localVideo.srcObject = screenStream;
        
        videoTrack.onended = () => {
            stopScreenSharing();
        };
        
        isScreenSharing = true;
        toggleScreenBtn.classList.add('bg-green-600');
        toggleScreenBtn.classList.remove('bg-purple-600');
        showToast('Screen sharing started');
    } else {
        stopScreenSharing();
    }
} catch (error) {
    console.error('Error during screen sharing:', error);
    showToast('Failed to start screen sharing');
}
});

// Stop screen sharing
async function stopScreenSharing() {
if (screenStream) {
    screenStream.getTracks().forEach(track => track.stop());
    
    const videoTrack = localStream.getVideoTracks()[0];
    const sender = peerConnection.getSenders().find(s => 
        s.track.kind === 'video'
    );
    
    await sender.replaceTrack(videoTrack);
    localVideo.srcObject = localStream;
    
    isScreenSharing = false;
    toggleScreenBtn.classList.remove('bg-green-600');
    toggleScreenBtn.classList.add('bg-purple-600');
    showToast('Screen sharing stopped');
}
}

// End call
endCallBtn.addEventListener('click', async () => {
try {
    if (peerConnection) {
        peerConnection.close();
    }
    if (currentRoom) {
        await db.ref(`rooms/${currentRoom}`).remove();
    }
    remoteVideo.srcObject = null;
    remoteStatus.innerHTML = '<i class="fas fa-circle text-gray-500"></i> Waiting';
    showToast('Call ended');
    currentRoom = null;
    roomIdDisplay.textContent = '';
} catch (error) {
    console.error('Error ending call:', error);
    showToast('Error ending call');
}
});

// Copy room ID
copyRoomBtn.addEventListener('click', () => {
if (currentRoom) {
    navigator.clipboard.writeText(currentRoom)
        .then(() => showToast('Room ID copied to clipboard!'))
        .catch(() => showToast('Failed to copy room ID'));
}
});

// Join room button
joinRoomBtn.addEventListener('click', createOrJoinRoom);

// Network status monitoring
window.addEventListener('online', () => {
showToast('Internet connection restored');
if (peerConnection?.connectionState === 'failed') {
    handleConnectionFailure();
}
});

window.addEventListener('offline', () => {
showToast('Internet connection lost');
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
if (currentRoom) {
    db.ref(`rooms/${currentRoom}`).remove();
}
if (peerConnection) {
    peerConnection.close();
}
if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
}
if (screenStream) {
    screenStream.getTracks().forEach(track => track.stop());
}
});

// Initialize on page load
initializeStream();