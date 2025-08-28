const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Servir archivos estáticos
app.use(express.static('public'));

// Datos del juego
const rooms = new Map();
const players = new Map();

// Generar código único de sala
function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    // Verificar que no exista ya
    if (rooms.has(result)) {
        return generateRoomCode();
    }
    return result;
}

// Limpiar salas vacías
function cleanupEmptyRooms() {
    for (const [roomCode, room] of rooms.entries()) {
        if (room.players.length === 0) {
            rooms.delete(roomCode);
            console.log(`Sala ${roomCode} eliminada (vacía)`);
        }
    }
}

// Ejecutar limpieza cada 5 minutos
setInterval(cleanupEmptyRooms, 5 * 60 * 1000);

io.on('connection', (socket) => {
    console.log(`🔌 Jugador conectado: ${socket.id}`);

    // Crear sala
    socket.on('createRoom', (data) => {
        try {
            const roomCode = generateRoomCode();
            const playerId = socket.id;
            
            const player = {
                id: playerId,
                socketId: socket.id,
                name: data.hostName,
                isHost: true,
                position: 0
            };

            const room = {
                code: roomCode,
                host: playerId,
                players: [player],
                students: [],
                gameStarted: false,
                gameRunning: false,
                gameSettings: {
                    gameMode: 'normal',
                    palette: 'rainbow',
                    uniqueColors: true,
                    useAccessories: false
                }
            };

            rooms.set(roomCode, room);
            players.set(playerId, { roomCode, socketId: socket.id });
            socket.join(roomCode);

            socket.emit('roomCreated', {
                roomCode,
                playerId,
                players: room.players
            });

            console.log(`🏠 Sala creada: ${roomCode} por ${data.hostName}`);
        } catch (error) {
            console.error('Error creando sala:', error);
            socket.emit('roomError', { message: 'Error al crear la sala' });
        }
    });

    // Unirse a sala
    socket.on('joinRoom', (data) => {
        try {
            const { roomCode, playerName } = data;
            const room = rooms.get(roomCode);

            if (!room) {
                socket.emit('roomError', { message: 'Sala no encontrada' });
                return;
            }

            if (room.gameStarted) {
                socket.emit('roomError', { message: 'La partida ya comenzó' });
                return;
            }

            if (room.players.length >= 35) {
                socket.emit('roomError', { message: 'Sala llena' });
                return;
            }

            // Verificar nombre duplicado
            if (room.players.some(p => p.name === playerName)) {
                socket.emit('roomError', { message: 'Nombre ya en uso' });
                return;
            }

            const playerId = socket.id;
            const player = {
                id: playerId,
                socketId: socket.id,
                name: playerName,
                isHost: false,
                position: 0
            };

            room.players.push(player);
            players.set(playerId, { roomCode, socketId: socket.id });
            socket.join(roomCode);

            // Notificar a todos en la sala
            io.to(roomCode).emit('playerJoined', {
                players: room.players,
                newPlayer: player
            });

            socket.emit('roomJoined', {
                roomCode,
                playerId,
                players: room.players
            });

            console.log(`👋 ${playerName} se unió a sala ${roomCode}`);
        } catch (error) {
            console.error('Error uniéndose a sala:', error);
            socket.emit('roomError', { message: 'Error al unirse a la sala' });
        }
    });

    // Abandonar sala
    socket.on('leaveRoom', (data) => {
        handlePlayerLeave(socket, data?.roomCode, data?.playerId);
    });

    // Actualizar lista de estudiantes
    socket.on('updateStudents', (data) => {
        try {
            const { roomCode, students } = data;
            const room = rooms.get(roomCode);
            const playerData = players.get(socket.id);

            if (!room || !playerData) {
                socket.emit('roomError', { message: 'Sala no encontrada' });
                return;
            }

            // Verificar que sea el host
            const player = room.players.find(p => p.socketId === socket.id);
            if (!player || !player.isHost) {
                socket.emit('roomError', { message: 'Solo el anfitrión puede actualizar la lista' });
                return;
            }

            room.students = students || [];
            
            // Notificar a todos en la sala
            socket.to(roomCode).emit('studentsUpdated', {
                students: room.students
            });

            console.log(`📚 Lista de estudiantes actualizada en sala ${roomCode}: ${students.length} estudiantes`);
        } catch (error) {
            console.error('Error actualizando estudiantes:', error);
            socket.emit('roomError', { message: 'Error al actualizar lista' });
        }
    });

    // Iniciar juego
    socket.on('startGame', (data) => {
        try {
            const { roomCode, students, gameMode, palette, uniqueColors, useAccessories } = data;
            const room = rooms.get(roomCode);

            if (!room) {
                socket.emit('roomError', { message: 'Sala no encontrada' });
                return;
            }

            // Verificar que sea el host
            const player = room.players.find(p => p.socketId === socket.id);
            if (!player || !player.isHost) {
                socket.emit('roomError', { message: 'Solo el anfitrión puede iniciar el juego' });
                return;
            }

            // Determinar jugadores para el juego
            let gamePlayers;
            if (students && students.length > 0) {
                gamePlayers = students;
            } else {
                if (room.players.length < 2) {
                    socket.emit('roomError', { message: 'Se necesitan al menos 2 jugadores' });
                    return;
                }
                gamePlayers = room.players.map(p => p.name);
            }

            room.gameStarted = true;
            room.gameRunning = true;
            room.gameSettings = {
                gameMode: gameMode || 'normal',
                palette: palette || 'rainbow',
                uniqueColors: uniqueColors !== false,
                useAccessories: useAccessories === true
            };

            // Inicializar posiciones
            room.players.forEach(p => p.position = 0);

            // Notificar inicio del juego
            io.to(roomCode).emit('gameStarted', {
                students: gamePlayers,
                gameMode: room.gameSettings.gameMode,
                palette: room.gameSettings.palette,
                uniqueColors: room.gameSettings.uniqueColors,
                useAccessories: room.gameSettings.useAccessories
            });

            console.log(`🏁 Juego iniciado en sala ${roomCode} con ${gamePlayers.length} jugadores`);
        } catch (error) {
            console.error('Error iniciando juego:', error);
            socket.emit('roomError', { message: 'Error al iniciar el juego' });
        }
    });

    // Actualización de posiciones durante el juego
    socket.on('gameUpdate', (data) => {
        try {
            const { roomCode, playerId, positions } = data;
            const room = rooms.get(roomCode);

            if (!room || !room.gameRunning) return;

            // Enviar actualización a otros jugadores
            socket.to(roomCode).emit('gameUpdate', {
                positions,
                fromPlayer: playerId
            });
        } catch (error) {
            console.error('Error en actualización de juego:', error);
        }
    });

    // Final del juego
    socket.on('gameEnd', (data) => {
        try {
            const { roomCode, playerId, winner, ranking } = data;
            const room = rooms.get(roomCode);

            if (!room || !room.gameRunning) return;

            room.gameRunning = false;

            // Notificar final del juego a todos
            io.to(roomCode).emit('gameEnded', {
                winner,
                ranking,
                endedBy: playerId
            });

            console.log(`🏆 Juego terminado en sala ${roomCode}. Ganador: ${winner.name}`);

            // Resetear para permitir nueva partida
            setTimeout(() => {
                if (rooms.has(roomCode)) {
                    room.gameStarted = false;
                    room.players.forEach(p => p.position = 0);
                }
            }, 5000);
        } catch (error) {
            console.error('Error terminando juego:', error);
        }
    });

    // Manejar desconexión
    socket.on('disconnect', () => {
        console.log(`🔌 Jugador desconectado: ${socket.id}`);
        handlePlayerLeave(socket);
    });

    // Función para manejar cuando un jugador abandona
    function handlePlayerLeave(socket, roomCode = null, playerId = null) {
        try {
            const socketId = socket.id;
            const playerData = players.get(socketId);
            
            if (!playerData && !roomCode) return;

            const targetRoomCode = roomCode || playerData.roomCode;
            const room = rooms.get(targetRoomCode);

            if (!room) return;

            // Remover jugador de la sala
            const playerIndex = room.players.findIndex(p => p.socketId === socketId);
            if (playerIndex === -1) return;

            const leavingPlayer = room.players[playerIndex];
            room.players.splice(playerIndex, 1);
            players.delete(socketId);

            if (room.players.length === 0) {
                // Sala vacía, eliminar
                rooms.delete(targetRoomCode);
                console.log(`🏠 Sala ${targetRoomCode} eliminada (sin jugadores)`);
            } else {
                // Si el que se va era el host, asignar nuevo host
                if (leavingPlayer.isHost && room.players.length > 0) {
                    room.players[0].isHost = true;
                    room.host = room.players[0].id;
                    console.log(`👑 Nuevo host en sala ${targetRoomCode}: ${room.players[0].name}`);
                }

                // Notificar a los jugadores restantes
                io.to(targetRoomCode).emit('playerLeft', {
                    players: room.players,
                    leftPlayer: leavingPlayer
                });
            }

            console.log(`👋 ${leavingPlayer.name} abandonó sala ${targetRoomCode}`);
        } catch (error) {
            console.error('Error manejando salida de jugador:', error);
        }
    }
});

// Ruta para obtener estadísticas del servidor (opcional)
app.get('/api/stats', (req, res) => {
    res.json({
        totalRooms: rooms.size,
        totalPlayers: players.size,
        rooms: Array.from(rooms.entries()).map(([code, room]) => ({
            code,
            players: room.players.length,
            gameStarted: room.gameStarted,
            gameRunning: room.gameRunning
        }))
    });
});

// Ruta principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Obtener la IP local
function getLocalIp() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

const localIp = getLocalIp();
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🦆 Servidor de Carrera de Patos corriendo en http://localhost:${PORT}`);
    console.log(`🌐 Acceso local desde otros dispositivos: http://${localIp}:${PORT}`);
    console.log(`📊 Estadísticas disponibles en http://localhost:${PORT}/api/stats`);
});

// Manejo graceful de cierre del servidor
process.on('SIGTERM', () => {
    console.log('🛑 Cerrando servidor...');
    server.close(() => {
        console.log('✅ Servidor cerrado exitosamente');
    });
});

process.on('SIGINT', () => {
    console.log('🛑 Cerrando servidor...');
    server.close(() => {
        console.log('✅ Servidor cerrado exitosamente');
    });
});