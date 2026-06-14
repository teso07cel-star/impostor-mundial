const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

let rooms = {};

const PLAYERS_DB = {
  current: [
    {
      name: "Lionel Messi",
      country: "Argentina 🇦🇷",
      position: "Delantero",
      club: "Inter Miami (EE.UU.)",
      details: "Ganador de 8 Balones de Oro, Campeón del Mundo en Qatar 2022, número 10 histórico.",
      image: "/images/messi.jpg"
    },
    {
      name: "Kylian Mbappé",
      country: "Francia 🇫🇷",
      position: "Delantero",
      club: "Real Madrid (España)",
      details: "Campeón del Mundo en Rusia 2018, anotó un hat-trick en la final de Qatar 2022.",
      image: "/images/mbappe.jpg"
    },
    {
      name: "Cristiano Ronaldo",
      country: "Portugal 🇵🇹",
      position: "Delantero",
      club: "Al-Nassr (Arabia Saudita)",
      details: "Máximo goleador histórico de selecciones, disputó 5 Mundiales anotando en todos.",
      image: "/images/ronaldo.jpg"
    },
    {
      name: "Neymar Jr",
      country: "Brasil 🇧🇷",
      position: "Delantero / Extremo",
      club: "Al-Hilal (Arabia Saudita)",
      details: "Goleador histórico de la selección brasileña, subcampeón de Copa América, crack del regate.",
      image: "/images/neymar.jpg"
    },
    {
      name: "Luka Modrić",
      country: "Croacia 🇭🇷",
      position: "Mediocampista",
      club: "Real Madrid (España)",
      details: "Ganador del Balón de Oro 2018, Subcampeón Mundial en Rusia 2018 y 3er puesto en Qatar 2022.",
      image: "/images/modric.png"
    },
    {
      name: "Kevin De Bruyne",
      country: "Bélgica 🇧🇪",
      position: "Mediocampista",
      club: "Manchester City (Inglaterra)",
      details: "Uno de los mejores asistentes de la historia, tercer puesto mundial en Rusia 2018.",
      image: "/images/debruyne.jpg"
    }
  ],
  legend: [
    {
      name: "Diego Maradona",
      country: "Argentina 🇦🇷",
      position: "Mediocampista Ofensivo",
      club: "Leyenda (ex-Napoli/Boca)",
      details: "Campeón del Mundo en México 1986, autor de 'La Mano de Dios' y el 'Gol del Siglo'.",
      image: "/images/maradona.jpg"
    },
    {
      name: "Pelé",
      country: "Brasil 🇧🇷",
      position: "Delantero",
      club: "Leyenda (ex-Santos)",
      details: "Único jugador en ganar 3 Copas del Mundo (1958, 1962, 1970). Apodado 'El Rey'.",
      image: "/images/pele.jpg"
    },
    {
      name: "Zinedine Zidane",
      country: "Francia 🇫🇷",
      position: "Mediocampista",
      club: "Leyenda (ex-Real Madrid/Juventus)",
      details: "Campeón del Mundo en Francia 1998 anotando dos goles en la final. Balón de Oro.",
      image: "/images/zidane.jpg"
    },
    {
      name: "Ronaldo Nazário",
      country: "Brasil 🇧🇷",
      position: "Delantero Centro",
      club: "Leyenda (ex-Real Madrid/Inter)",
      details: "Campeón del Mundo en 1994 y 2002. Goleador histórico y Balón de Oro.",
      image: "/images/ronaldonazario.jpg"
    },
    {
      name: "Ronaldinho Gaúcho",
      country: "Brasil 🇧🇷",
      position: "Mediapunta",
      club: "Leyenda (ex-Barcelona/Milan)",
      details: "Campeón del Mundo en 2002. Famoso por su magia, regates imposibles y alegría al jugar.",
      image: "/images/ronaldinho.jpg"
    }
  ]
};

function pickImpostors(players, count = 2) {
  return [...players].sort(() => Math.random() - 0.5).slice(0, count);
}

io.on("connection", (socket) => {

  socket.on("joinRoom", ({ roomId, name }) => {
    socket.join(roomId);
    socket.roomId = roomId;

    if (!rooms[roomId]) {
      rooms[roomId] = {
        players: [],
        turnIndex: 0,
        impostors: [],
        timeoutId: null,
        roundNumber: 0,
        turnsInRound: 0,
        startingPlayerId: null,
        startingPlayerName: "",
        votes: {},
        allImpostors: []
      };
    }

    rooms[roomId].players.push({
      id: socket.id,
      name,
      suspicion: 0,
      alive: true
    });

    io.to(roomId).emit("updatePlayers", rooms[roomId].players);
  });

  socket.on("startGame", (roomId) => {
    const room = rooms[roomId];
    if (!room || room.players.length === 0) return;

    if (room.timeoutId) {
      clearTimeout(room.timeoutId);
    }

    // Restore alive status and reset suspicion for all players in room
    room.players.forEach(p => {
      p.alive = true;
      p.suspicion = 0;
    });

    // Increment round number
    room.roundNumber = (room.roundNumber || 0) + 1;

    // Pick dynamic secret player
    const isLegendRound = room.roundNumber >= 4;
    const pool = isLegendRound ? PLAYERS_DB.legend : PLAYERS_DB.current;
    const secretPlayer = pool[Math.floor(Math.random() * pool.length)];
    room.secretPlayer = secretPlayer;

    // Reset votes
    room.votes = {};
    io.to(roomId).emit("voteUpdated", { votes: {}, voteCounts: {} });

    // Dynamic impostor count: 1 if <= 4 players, 2 if >= 5 players
    const impostorCount = room.players.length >= 5 ? 2 : 1;
    const chosenImpostors = pickImpostors(room.players, impostorCount);
    room.impostors = [...chosenImpostors];
    room.allImpostors = [...chosenImpostors];

    // Pick random starting player from all connected players
    room.turnIndex = Math.floor(Math.random() * room.players.length);
    room.startingPlayerId = room.players[room.turnIndex].id;
    room.startingPlayerName = room.players[room.turnIndex].name;
    room.turnsInRound = 0;

    // Send roles and player details individually to each socket
    room.players.forEach(p => {
      const isImpostor = room.impostors.some(imp => imp.id === p.id);
      io.to(p.id).emit("roleAssigned", {
        role: isImpostor ? "impostor" : "innocent",
        secretPlayer: isImpostor ? null : room.secretPlayer,
        roundNumber: room.roundNumber
      });
    });

    // Send updated list showing everyone is alive
    io.to(roomId).emit("updatePlayers", room.players);

    startTurn(roomId);
  });

  function startTurn(roomId) {
    const room = rooms[roomId];
    if (!room || room.players.length === 0) return;

    if (room.timeoutId) {
      clearTimeout(room.timeoutId);
    }

    const alivePlayers = room.players.filter(p => p.alive);
    if (alivePlayers.length === 0) return;

    // If everyone who is alive has talked once, pause rotation
    if (room.turnsInRound >= alivePlayers.length) {
      io.to(roomId).emit("roundEnded", {
        startingPlayerName: room.startingPlayerName,
        startingPlayerId: room.startingPlayerId
      });
      return;
    }

    // Ensure turnIndex points to an alive player
    let currentPlayer = alivePlayers[room.turnIndex % alivePlayers.length];

    io.to(roomId).emit("newTurn", {
      player: currentPlayer.name,
      time: 30
    });

    room.turnsInRound++;

    room.timeoutId = setTimeout(() => {
      room.turnIndex++;
      startTurn(roomId);
    }, 30000);
  }

  socket.on("requestNextRound", (roomId) => {
    const room = rooms[roomId];
    if (!room || room.players.length === 0) return;

    if (room.timeoutId) {
      clearTimeout(room.timeoutId);
    }

    const alivePlayers = room.players.filter(p => p.alive);
    if (alivePlayers.length === 0) return;

    // Start a new round of turns with a new random starting alive player
    room.turnIndex = Math.floor(Math.random() * alivePlayers.length);
    const chosenPlayer = alivePlayers[room.turnIndex % alivePlayers.length];
    room.startingPlayerId = chosenPlayer.id;
    room.startingPlayerName = chosenPlayer.name;
    room.turnsInRound = 0;

    io.to(roomId).emit("roundRestarted");
    startTurn(roomId);
  });

  socket.on("requestVoting", (roomId) => {
    const room = rooms[roomId];
    if (!room || room.players.length === 0) return;

    if (room.timeoutId) {
      clearTimeout(room.timeoutId);
      room.timeoutId = null;
    }

    io.to(roomId).emit("votingStarted", {
      startingPlayerName: room.startingPlayerName,
      startingPlayerId: room.startingPlayerId
    });
  });

  socket.on("reaction", ({ roomId, targetId, type }) => {
    const room = rooms[roomId];
    if (!room) return;

    const p = room.players.find(x => x.id === targetId);
    if (!p) return;

    if (type === "sus") p.suspicion += 2;
    if (type === "doubt") p.suspicion += 1;

    io.to(roomId).emit("updatePlayers", room.players);
  });

  socket.on("votePlayer", ({ roomId, targetId }) => {
    const room = rooms[roomId];
    if (!room) return;

    // Record vote
    room.votes[socket.id] = targetId;

    // Count votes among alive players
    const alivePlayers = room.players.filter(p => p.alive);
    const voteCounts = {};
    alivePlayers.forEach(p => { voteCounts[p.id] = 0; });
    Object.keys(room.votes).forEach(vid => {
      const voterPlayer = room.players.find(x => x.id === vid);
      if (voterPlayer && voterPlayer.alive) {
        const tid = room.votes[vid];
        if (voteCounts[tid] !== undefined) {
          voteCounts[tid]++;
        }
      }
    });

    io.to(roomId).emit("voteUpdated", {
      votes: room.votes,
      voteCounts: voteCounts
    });

    // Check for majority (> half of active alive players)
    const majorityThreshold = alivePlayers.length / 2;
    const electedPlayerId = Object.keys(voteCounts).find(pid => voteCounts[pid] > majorityThreshold);

    if (electedPlayerId) {
      const p = room.players.find(x => x.id === electedPlayerId);
      p.alive = false; // Mark as dead/ejected

      // Check remaining alive status
      const aliveImpostors = room.players.filter(pl => pl.alive && room.impostors.some(imp => imp.id === pl.id));
      const aliveInnocents = room.players.filter(pl => pl.alive && !room.impostors.some(imp => imp.id === pl.id));

      if (aliveImpostors.length === 0) {
        // Innocents win!
        io.to(roomId).emit("gameEnded", {
          winner: "innocents",
          ejectedPlayer: p.name,
          wasImpostor: true,
          impostors: room.allImpostors.map(imp => imp.name)
        });
        if (room.timeoutId) {
          clearTimeout(room.timeoutId);
          room.timeoutId = null;
        }
      } else if (aliveImpostors.length >= aliveInnocents.length) {
        // Impostors win!
        io.to(roomId).emit("gameEnded", {
          winner: "impostors",
          ejectedPlayer: p.name,
          wasImpostor: room.impostors.some(imp => imp.id === electedPlayerId),
          impostors: room.allImpostors.map(imp => imp.name)
        });
        if (room.timeoutId) {
          clearTimeout(room.timeoutId);
          room.timeoutId = null;
        }
      } else {
        // Game continues! Reset votes
        room.votes = {};
        io.to(roomId).emit("voteUpdated", { votes: {}, voteCounts: {} });
        io.to(roomId).emit("updatePlayers", room.players);

        io.to(roomId).emit("playerEjected", {
          ejectedPlayer: p.name,
          wasImpostor: room.impostors.some(imp => imp.id === electedPlayerId),
          remainingImpostorsCount: aliveImpostors.length
        });

        // Automatically start a new round of turns for the remaining alive players
        const nextAlivePlayers = room.players.filter(pl => pl.alive);
        room.turnIndex = Math.floor(Math.random() * nextAlivePlayers.length);
        const chosenPlayer = nextAlivePlayers[room.turnIndex % nextAlivePlayers.length];
        room.startingPlayerId = chosenPlayer.id;
        room.startingPlayerName = chosenPlayer.name;
        room.turnsInRound = 0;
        startTurn(roomId);
      }
    }
  });

  socket.on("disconnect", () => {
    const { roomId } = socket;
    if (roomId && rooms[roomId]) {
      rooms[roomId].players = rooms[roomId].players.filter(p => p.id !== socket.id);
      rooms[roomId].impostors = rooms[roomId].impostors.filter(p => p.id !== socket.id);

      if (rooms[roomId].players.length === 0) {
        if (rooms[roomId].timeoutId) {
          clearTimeout(rooms[roomId].timeoutId);
        }
        delete rooms[roomId];
      } else {
        io.to(roomId).emit("updatePlayers", rooms[roomId].players);
      }
    }
  });

});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port", PORT);
});
