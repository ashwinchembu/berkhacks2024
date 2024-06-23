import React, { useState, useEffect, useRef } from 'react';
import { Camera, Info } from 'lucide-react';
import * as tmImage from '@teachablemachine/image';

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
  const OPENAI_KEY = process.env.REACT_APP_OPENAI_API_KEY;
  const URL = 'https://teachablemachine.withgoogle.com/models/2SxVSXTTo/';
  let model, webcam, labelContainer, maxPredictions;

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
      speakIntroduction();
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
      try {
        const response = await fetchOpenAI(base64Image, userTranscript);
        setCommentary(response.choices[0].message.content);
        speakResponse(response.choices[0].message.content);
      } catch (error) {
        setError('Error processing the image with OpenAI');
        console.error('OpenAI error:', error);
      }
      setUserTranscript('');
      uploadToTeachableMachine(blob);
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
        'Authorization': `Bearer ${OPENAI_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are Dermai, an AI that detects skin conditions and determines how you can help. Ask the user to show their skin condition on camera and send the image to TensorFlow for classification. Provide the user with the classification result." },
          { role: "user", content: `The user just spoken said: "${text}"; the image is of their skin condition. Reply to them based on what you see and what they said.` },
          { role: "user", content: `data:image/jpeg;base64,${base64Image}` }
        ]
      })
    });

    if (!response.ok) {
      throw new Error('Network response was not ok');
    }

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

  const circleSize =30 + volume * 32; // Base size 64, max growth 32

  const uploadToTeachableMachine = async (blob) => {
    if (!model) {
      try {
        const modelURL = URL + "model.json";
        const metadataURL = URL + "metadata.json";
        console.log(`Attempting to load model from: ${modelURL}`);
        console.log(`Attempting to load metadata from: ${metadataURL}`);
        
        // Fetch model JSON
        const modelResponse = await fetch(modelURL);
        const modelJson = await modelResponse.text();
        console.log('Model JSON:', modelJson);

        // Fetch metadata JSON
        const metadataResponse = await fetch(metadataURL);
        const metadataJson = await metadataResponse.text();
        console.log('Metadata JSON:', metadataJson);

        // Attempt to parse JSON content to ensure it's valid
        JSON.parse(modelJson);
        JSON.parse(metadataJson);

        model = await tmImage.load(modelURL, metadataURL);
        maxPredictions = model.getTotalClasses();
        console.log('Model and metadata loaded successfully');
      } catch (error) {
        console.error('Error loading Teachable Machine model:', error);
        setError('Error loading Teachable Machine model');
        return;
      }
    }

    const image = new Image();
    const objectURL = window.URL.createObjectURL(blob);
    image.src = objectURL;
    image.onload = async () => {
      try {
        const prediction = await model.predict(image);
        let condition = "Unknown condition";
        let highestProbability = 0;

        for (let i = 0; i < maxPredictions; i++) {
          if (prediction[i].probability > highestProbability) {
            highestProbability = prediction[i].probability;
            condition = prediction[i].className;
          }
        }

        if (highestProbability * 100 >= 80) {
          setCommentary(`It looks like you have ${condition} with a probability of ${(highestProbability * 100).toFixed(2)}%.`);
          speakResponse(`It looks like you have ${condition} with a probability of ${(highestProbability * 100).toFixed(2)}%.`);
        } else {
          setCommentary("You have clear skin or there aren't any visible skin issues. Please change your view.");
          speakResponse("You have clear skin or there aren't any visible skin issues. Please change your view.");
        }

        // Revoke the object URL to release memory
        window.URL.revokeObjectURL(objectURL);
      } catch (error) {
        console.error('Error predicting image with Teachable Machine model:', error);
        setError('Error predicting image with Teachable Machine model');
        // Revoke the object URL in case of error
        window.URL.revokeObjectURL(objectURL);
      }
    };
  };

  const speakIntroduction = () => {
    const introduction = "Hello, I am Dermai. I can help detect skin conditions. Please turn on your camera and show me the area you are concerned about. I will capture an image and analyze it using a TensorFlow model to provide you with more information.";
    const utterance = new SpeechSynthesisUtterance(introduction);
    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className="flex h-screen bg-black text-white">
      {/* Left side: Chat input/output and controls */}
      <div className="w-1/2 flex flex-col p-4">
        {/* Scrollable chat area */}
        <div className="flex-grow overflow-y-auto mb-4">
          <div className="bg-gray-800 rounded p-4 mb-4 text-blue-400">
            {userTranscript}
          </div>
          <div className="bg-gray-800 rounded p-4 text-green-400 mt-80">
            {commentary}
          </div>
        </div>

        {/* Controls */}
       {/* Controls */}
    <div className="flex items-center justify-center">
      <button
        className="px-6 py-3 bg-blue-500 text-white rounded-full flex items-center justify-center hover:bg-blue-600 transition-colors"
        onClick={handleButtonClick}
      >
        {isCapturing ? 'Stop' : 'Start'}
      </button>
    </div>
      </div>

      {/* Right side: AI, webcam, and circle */}
      <div className="w-1/2 flex flex-col relative">
        {/* Webcam */}
        <div className="h-1/2">
          <video 
            ref={videoRef} 
            className={`w-full h-full object-cover ${isCapturing ? 'block' : 'hidden'}`}
          />
        </div>

        {/* AI representation and circle */}
        <div className="h-1/2 flex items-center justify-center relative">

          
          {/* Circle */}
          <div
            className="absolute inset-0 m-auto bg-white rounded-full transition-all duration-100 ease-in-out"
            style={{
              width: `${circleSize}px`,
              height: `${circleSize}px`,
              opacity: 0.1 + volume * 0.9
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default Agent;
