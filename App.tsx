
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { analyzeImage } from './services/geminiService';
import type { DetectionEvent } from './types';
import { Camera, AlertTriangle, CheckCircle, Power, Loader, Clipboard, Video, XCircle } from 'lucide-react';
import type Peer from 'peerjs';
import type { MediaConnection } from 'peerjs';

const MOTION_SENSITIVITY = 50; // Lower is more sensitive
const COOLDOWN_SECONDS = 10;

// Helper component: StatusDisplay
interface StatusDisplayProps {
    status: string;
}
const StatusDisplay: React.FC<StatusDisplayProps> = ({ status }) => {
    let Icon;
    let textColor;

    switch (status) {
        case 'Monitorando...':
            Icon = CheckCircle;
            textColor = 'text-green-400';
            break;
        case 'Movimento Detectado!':
            Icon = AlertTriangle;
            textColor = 'text-yellow-400';
            break;
        case 'Analisando Imagem...':
            Icon = Loader;
            textColor = 'text-blue-400';
            break;
        case 'Parado':
        default:
            Icon = Power;
            textColor = 'text-red-400';
            break;
    }

    return (
        <div className={`flex items-center justify-center gap-2 p-2 rounded-lg bg-gray-800/50 backdrop-blur-sm ${textColor}`}>
            <Icon className={`w-5 h-5 ${status === 'Analisando Imagem...' ? 'animate-spin' : ''}`} />
            <span className="font-medium">{status}</span>
        </div>
    );
};


// Helper component: EventCard
interface EventCardProps {
    event: DetectionEvent;
}
const EventCard: React.FC<EventCardProps> = ({ event }) => {
    return (
        <div className="bg-gray-800 rounded-lg overflow-hidden shadow-lg animate-fade-in">
            <img src={event.imageDataUrl} alt="Captura de evento de segurança" className="w-full h-auto object-cover" />
            <div className="p-4">
                <p className="text-sm text-gray-400 mb-2">
                    {event.timestamp.toLocaleDateString('pt-BR')} - {event.timestamp.toLocaleTimeString('pt-BR')}
                </p>
                {event.isAnalyzing ? (
                    <div className="flex items-center gap-2 text-blue-400">
                        <Loader className="w-4 h-4 animate-spin" />
                        <span>Analisando...</span>
                    </div>
                ) : (
                    <p className="text-gray-200">{event.analysis || "Não foi possível analisar a imagem."}</p>
                )}
            </div>
        </div>
    );
};

// New Viewer Component for real-time streaming
const Viewer: React.FC<{ peerId: string }> = ({ peerId }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const peerRef = useRef<Peer | null>(null);
    const [status, setStatus] = useState('Conectando à câmera...');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;
        import('peerjs').then(({ default: Peer }) => {
            if (!isMounted) return;

            const peer = new Peer();
            peerRef.current = peer;

            peer.on('open', () => {
                if (!peerId) {
                    setError("Nenhum ID de câmera fornecido.");
                    setStatus("Erro");
                    return;
                }
                
                const call = peer.call(peerId, new MediaStream());

                call.on('stream', (remoteStream) => {
                    setStatus('Conectado');
                    setError(null);
                    if (videoRef.current) {
                        videoRef.current.srcObject = remoteStream;
                    }
                });
                
                call.on('close', () => {
                    setStatus('Câmera desconectada');
                });
                
                call.on('error', () => {
                    setError("Não foi possível conectar à câmera. Verifique se o link está correto e se a câmera está ativa e monitorando.");
                    setStatus('Erro de conexão');
                });
            });

            peer.on('error', (err: any) => {
                setError(`Erro de conexão P2P (${err.type}). A câmera pode estar offline ou o ID ser inválido.`);
                setStatus('Erro');
            });
        });

        return () => {
            isMounted = false;
            peerRef.current?.destroy();
        };
    }, [peerId]);

    return (
        <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4">
            <header className="w-full max-w-5xl mb-4 text-center">
                <h1 className="text-3xl md:text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-teal-300">
                    Visualizador da Câmera
                </h1>
            </header>
            <div className="relative aspect-video w-full max-w-5xl bg-black rounded-xl shadow-2xl overflow-hidden border-2 border-gray-700">
                <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover"></video>
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 transition-opacity duration-300" style={{ opacity: status !== 'Conectado' ? 1 : 0, pointerEvents: status !== 'Conectado' ? 'auto' : 'none' }}>
                    {error ? (
                        <div className="text-center text-red-400 p-4">
                            <XCircle className="w-16 h-16 mx-auto mb-4" />
                            <h2 className="text-2xl font-bold">{status}</h2>
                            <p className="mt-2 max-w-sm">{error}</p>
                        </div>
                    ) : (
                        <div className="text-center text-gray-200">
                            <Loader className="w-16 h-16 mx-auto mb-4 animate-spin" />
                            <h2 className="text-2xl font-bold">{status}</h2>
                        </div>
                    )}
                </div>
            </div>
            <footer className="mt-4 text-center text-gray-500">
                <p>Visualizando a transmissão de: {peerId}</p>
                 <a href={window.location.origin + window.location.pathname} className="text-blue-400 hover:underline mt-2 inline-block">Voltar para o modo câmera</a>
            </footer>
        </div>
    );
};


// The original App component, now for the Camera view
const CameraView: React.FC = () => {
    const [isMonitoring, setIsMonitoring] = useState<boolean>(false);
    const [events, setEvents] = useState<DetectionEvent[]>([]);
    const [status, setStatus] = useState<string>('Parado');
    const [error, setError] = useState<string | null>(null);
    const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
    const [peerId, setPeerId] = useState<string | null>(null);
    const [peerError, setPeerError] = useState<string | null>(null);
    const [isLinkCopied, setIsLinkCopied] = useState(false);

    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const oldCanvasRef = useRef<HTMLCanvasElement>(null);
    const animationFrameId = useRef<number | null>(null);
    const lastDetectionTime = useRef<number>(0);
    const peerRef = useRef<Peer | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const pendingCalls = useRef<MediaConnection[]>([]);

    useEffect(() => {
        let isMounted = true;
        import('peerjs').then(({ default: Peer }) => {
            if (!isMounted) return;
            const peer = new Peer();
            peerRef.current = peer;

            peer.on('open', (id) => setPeerId(id));
            
            peer.on('call', (call) => {
                if (mediaStreamRef.current) {
                    call.answer(mediaStreamRef.current);
                } else {
                    pendingCalls.current.push(call);
                }
            });
            
            peer.on('error', (err: any) => {
                console.error("PeerJS error:", err);
                setPeerError(`Erro de conexão P2P (${err.type}). Tente recarregar a página.`);
            });
        });
        return () => {
            isMounted = false;
            peerRef.current?.destroy();
        };
    }, []); 

    const cleanupCamera = useCallback(() => {
        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach(track => track.stop());
        }
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }
        mediaStreamRef.current = null;
    }, []);

    const setupCamera = useCallback(async () => {
        setError(null);
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error("A API da câmera não é suportada neste navegador.");
            }
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
            mediaStreamRef.current = stream;
            setHasCameraPermission(true);
            
            // Answer any pending calls now that the stream is ready
            pendingCalls.current.forEach(call => {
                call.answer(stream);
            });
            pendingCalls.current = [];

        } catch (err) {
            if (err instanceof Error) {
                setError(err.name === 'NotAllowedError' ? "Permissão para câmera negada." : `Erro ao acessar câmera: ${err.message}`);
            } else {
                setError("Ocorreu um erro desconhecido ao acessar a câmera.");
            }
            setHasCameraPermission(false);
            cleanupCamera();
        }
    }, [cleanupCamera]);


    const handleMotionDetected = useCallback(async (imageDataUrl: string) => {
        const now = Date.now();
        if (now - lastDetectionTime.current < COOLDOWN_SECONDS * 1000) return;
        lastDetectionTime.current = now;

        const newEvent: DetectionEvent = { id: now.toString(), timestamp: new Date(), imageDataUrl, analysis: null, isAnalyzing: true };
        setEvents(prevEvents => [newEvent, ...prevEvents]);
        setStatus('Analisando Imagem...');

        try {
            const description = await analyzeImage(imageDataUrl);
            setEvents(p => p.map(e => e.id === newEvent.id ? { ...e, analysis: description, isAnalyzing: false } : e));
        } catch (apiError) {
            setEvents(p => p.map(e => e.id === newEvent.id ? { ...e, analysis: "Falha ao analisar a imagem.", isAnalyzing: false } : e));
        } finally {
            if (isMonitoring) setStatus('Monitorando...');
        }
    }, [isMonitoring]);

    const drawAndCompare = useCallback(() => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const oldCanvas = oldCanvasRef.current;
        if (!video || !canvas || !oldCanvas || video.readyState !== 4) return;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const oldCtx = oldCanvas.getContext('2d', { willReadFrequently: true });
        if (!ctx || !oldCtx) return;

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const currentData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const oldData = oldCtx.getImageData(0, 0, oldCanvas.width, oldCanvas.height).data;
        let diff = 0;
        for (let i = 0; i < currentData.length; i += 4) {
            diff += Math.abs(currentData[i] - oldData[i]) + Math.abs(currentData[i + 1] - oldData[i + 1]) + Math.abs(currentData[i + 2] - oldData[i + 2]);
        }
        if (diff / (currentData.length / 4) > MOTION_SENSITIVITY) {
            setStatus('Movimento Detectado!');
            handleMotionDetected(canvas.toDataURL('image/jpeg'));
        }
        oldCtx.drawImage(canvas, 0, 0, oldCanvas.width, oldCanvas.height);
    }, [handleMotionDetected]);
    
    const detectionLoop = useCallback(() => {
        if (!isMonitoring) return;
        drawAndCompare();
        animationFrameId.current = requestAnimationFrame(detectionLoop);
    }, [isMonitoring, drawAndCompare]);

    useEffect(() => {
        if (isMonitoring) {
            setupCamera();
        } else {
            cleanupCamera();
        }
        return cleanupCamera;
    }, [isMonitoring, setupCamera, cleanupCamera]);

    useEffect(() => {
        if (isMonitoring && hasCameraPermission) {
            setStatus('Monitorando...');
            lastDetectionTime.current = 0;
            animationFrameId.current = requestAnimationFrame(detectionLoop);
        } else {
            if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
            if (!isMonitoring) setStatus('Parado');
        }
        return () => {
            if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
        };
    }, [isMonitoring, hasCameraPermission, detectionLoop]);

    const toggleMonitoring = () => setIsMonitoring(prev => !prev);
    
    const shareableLink = peerId ? `${window.location.origin}${window.location.pathname}?view=${peerId}` : '';

    const copyLink = () => {
        if (!shareableLink) return;
        navigator.clipboard.writeText(shareableLink).then(() => {
            setIsLinkCopied(true);
            setTimeout(() => setIsLinkCopied(false), 2000);
        });
    };

    return (
        <div className="min-h-screen bg-gray-900 flex flex-col items-center p-4 md:p-6 lg:p-8">
            <header className="w-full max-w-5xl mb-4 text-center">
                <h1 className="text-3xl md:text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-teal-300">Vigilância IA</h1>
                <p className="text-gray-400 mt-1">Sua câmera de segurança inteligente</p>
            </header>

            <main className="w-full max-w-5xl flex-grow flex flex-col items-center gap-6">
                <div className="relative aspect-video w-full bg-black rounded-xl shadow-2xl overflow-hidden border-2 border-gray-700">
                    <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover"></video>
                    {!hasCameraPermission && isMonitoring && (
                         <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 text-center p-4">
                             {error ? <><AlertTriangle className="w-12 h-12 text-red-500 mb-4" /><p className="text-red-300">{error}</p></> : <><Camera className="w-12 h-12 text-gray-400 mb-4" /><p className="text-gray-300">Aguardando permissão da câmera...</p></>}
                        </div>
                    )}
                    <div className="absolute top-3 right-3"><StatusDisplay status={status} /></div>
                </div>

                <div className="w-full flex justify-center">
                    <button onClick={toggleMonitoring} className={`w-full max-w-xs md:px-10 py-4 text-lg font-bold rounded-full transition-all duration-300 flex items-center justify-center gap-3 shadow-lg focus:outline-none focus:ring-4 ${isMonitoring ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500/50 text-white' : 'bg-green-600 hover:bg-green-700 focus:ring-green-500/50 text-white'}`}>
                        <Power className="w-6 h-6" />{isMonitoring ? 'Parar Monitoramento' : 'Iniciar Monitoramento'}
                    </button>
                </div>

                {isMonitoring && peerId && (
                    <div className="w-full max-w-5xl">
                        <div className="bg-gray-800 p-4 rounded-lg w-full text-center shadow-md">
                            <h3 className="text-lg font-semibold mb-2 text-gray-200">Compartilhar Transmissão ao Vivo</h3>
                            <p className="text-sm text-gray-400 mb-3">Qualquer pessoa com este link pode ver sua câmera.</p>
                            <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
                                <input type="text" readOnly value={shareableLink} className="w-full sm:w-auto flex-grow bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-gray-200 focus:outline-none" onClick={(e) => (e.target as HTMLInputElement).select()} />
                                <button onClick={copyLink} className="w-full sm:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md transition-colors flex items-center justify-center gap-2">
                                    {isLinkCopied ? <CheckCircle className="w-5 h-5" /> : <Clipboard className="w-5 h-5" />}
                                    {isLinkCopied ? 'Copiado!' : 'Copiar Link'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
                {peerError && <div className="w-full max-w-5xl mt-4 p-3 bg-red-900/50 border border-red-700 text-red-300 rounded-lg text-center">{peerError}</div>}
                
                {events.length > 0 && (
                     <div className="w-full">
                        <h2 className="text-2xl font-semibold mb-4 border-b-2 border-gray-700 pb-2">Registro de Eventos</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 pb-24 md:pb-0">
                            {events.map(event => <EventCard key={event.id} event={event} />)}
                        </div>
                    </div>
                )}
            </main>
            <canvas ref={canvasRef} width="320" height="240" className="hidden"></canvas>
            <canvas ref={oldCanvasRef} width="320" height="240" className="hidden"></canvas>
        </div>
    );
};


// Main App component that acts as a router
const App: React.FC = () => {
    const [viewPeerId, setViewPeerId] = useState<string | null>(null);
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const peerId = urlParams.get('view');
        setViewPeerId(peerId);
        setIsReady(true);
    }, []);

    if (!isReady) {
        return <div className="min-h-screen bg-gray-900 flex items-center justify-center"><Loader className="w-12 h-12 animate-spin text-blue-400" /></div>;
    }
    
    return viewPeerId ? <Viewer peerId={viewPeerId} /> : <CameraView />;
};

export default App;
