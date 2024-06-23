import React, { useState, useEffect, useRef } from 'react';
import { Camera, Info } from 'lucide-react';

const Agent = () => {
  const [isListening, setIsListening] = useState(false);
  const [volume, setVolume] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [commentary, setCommentary] = useState('');
  const [userTranscript, setUserTranscript] = useState('');
  const audioContext = useRef(null);
  const analyzer = useRef(null);
  const microphone = useRef(null);
  const animationFrame = useRef(null);
  const mediaStream = useRef(null);
  const recognition = useRef(null);
  const videoRef = useRef(null);
  const inactivityTimeout = useRef(null);

  // Initialize speech recognition and set up event handlers
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      recognition.current = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
      recognition.current.continuous = true;
      recognition.current.interimResults = true;
      recognition.current.lang = 'en-US';

      recognition.current.onresult = event => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }
        setTranscript(finalTranscript + interimTranscript);
        setUserTranscript(finalTranscript + interimTranscript);
        resetInactivityTimeout();
      };

      recognition.current.onerror = event => {
        console.error('SpeechRecognition error', event.error);
        setError('Speech recognition error');
      };
    } else {
      setError('Speech recognition not supported in this browser');
    }

    return () => {
      if (animationFrame.current) {
        cancelAnimationFrame(animationFrame.current);
      }
      if (audioContext.current) {
        audioContext.current.close();
      }
      if (mediaStream.current) {
        mediaStream.current.getTracks().forEach(track => track.stop());
      }
      if (recognition.current) {
        recognition.current.stop();
      }
      clearTimeout(inactivityTimeout.current);
    };
  }, []);

  useEffect(() => {
    if (isCapturing) {
      startVideoCapture();
      startListening();
    } else {
      stopVideoCapture();
      stopListening();
    }
  }, [isCapturing]);

  const startListening = async () => {
    try {
      mediaStream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContext.current = new (window.AudioContext || window.webkitAudioContext)();
      analyzer.current = audioContext.current.createAnalyser();
      microphone.current = audioContext.current.createMediaStreamSource(mediaStream.current);
      microphone.current.connect(analyzer.current);
      analyzer.current.fftSize = 256;
      setIsListening(true);
      setError(null);
      animateCircle();
      recognition.current.start();
      resetInactivityTimeout();
    } catch (error) {
      console.error('Error accessing microphone:', error);
      setError('Error accessing microphone');
    }
  };

  const stopListening = () => {
    if (microphone.current) {
      microphone.current.disconnect();
    }
    if (audioContext.current) {
      audioContext.current.close();
    }
    if (mediaStream.current) {
      mediaStream.current.getTracks().forEach(track => track.stop());
    }
    if (recognition.current) {
      recognition.current.stop();
    }
    setIsListening(false);
    setVolume(0);
    if (animationFrame.current) {
      cancelAnimationFrame(animationFrame.current);
    }
    clearTimeout(inactivityTimeout.current);
  };

  const animateCircle = () => {
    const dataArray = new Uint8Array(analyzer.current.frequencyBinCount);
    analyzer.current.getByteFrequencyData(dataArray);
    const average = dataArray.reduce((acc, val) => acc + val, 0) / dataArray.length;
    const normalizedVolume = Math.min(average / 128, 1);
    setVolume(normalizedVolume);
    animationFrame.current = requestAnimationFrame(animateCircle);
  };

  const startVideoCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      videoRef.current.srcObject = stream;
      videoRef.current.play();
      resetInactivityTimeout();
    } catch (error) {
      console.error('Error accessing camera:', error);
      setError('Error accessing camera');
    }
  };

  const stopVideoCapture = () => {
    if (videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
    }
    clearTimeout(inactivityTimeout.current);
  };

  const captureFrame = () => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const video = videoRef.current;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(async (blob) => {
      const base64Image = await blobToBase64(blob);
      const response = await fetchOpenAI(base64Image, userTranscript);
      setCommentary(response.choices[0].message.content);
      speakResponse(response.choices[0].message.content);
      setUserTranscript('');
    }, 'image/jpeg');
  };

  const blobToBase64 = (blob) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve(reader.result.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const fetchOpenAI = async (base64Image, text) => {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer sk-proj-Zvq7COD0QeyjL5P7ZpBvT3BlbkFJXov2eY2JLz9rtI0p0NtI`
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are a friendly helpful assistant." },
          {
            role: "user", content: [
              { type: "text", text: `The user just spoken said: "${text}"; the image is of them now. Reply to them based on what you see and what they said` },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}` } }
            ]
          }
        ]
      })
    });
    return response.json();
  };

  const speakResponse = (text) => {
    const utterance = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(utterance);
  };

  const resetInactivityTimeout = () => {
    clearTimeout(inactivityTimeout.current);
    inactivityTimeout.current = setTimeout(() => {
      captureFrame();
    }, 5000); // 5 seconds of inactivity
  };

  const handleButtonClick = () => {
    setIsCapturing(!isCapturing);
  };

  const circleSize = 64 + volume * 32; // Base size 64, max growth 32

  return (
    <div className="flex flex-col items-center justify-between h-screen bg-black text-white p-4">
      <div className="self-end">
        <Info size={24} />
      </div>

      <div className="flex-grow flex items-center justify-center">
        <div
          className="bg-white rounded-full flex items-center justify-center transition-all duration-100 ease-in-out"
          style={{
            width: `${circleSize}vmin`,
            height: `${circleSize}vmin`,
            opacity: 0.1 + volume * 0.9 // Adjust opacity based on volume
          }}
        />
      </div>

      <div className="w-full flex justify-center items-center">
        <button
          className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center"
          onClick={handleButtonClick}
          aria-label={isCapturing ? 'Stop Video and Audio Capture' : 'Start Video and Audio Capture'}
        >
          <Camera size={24} />
        </button>
      </div>

      <video ref={videoRef} style={{ display: isCapturing ? 'block' : 'none', width: '200px', height: '150px', position: 'absolute', top: '10px', right: '10px' }} />

      <div className="w-full mt-4">
        <div className="bg-gray-800 rounded p-4 mb-4 text-blue-400">
          {userTranscript}
        </div>
        <div className="bg-gray-800 rounded p-4 text-green-400">
          {commentary}
        </div>
      </div>
    </div>
  );
};

export default Agent;
