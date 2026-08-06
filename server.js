const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'), {
    headers: { 'Content-Type': 'text/html' }
  });
});

const rooms = {};

const fallbackLies = [
  "Accidentally joining a cult",
  "Selling fake bath salts",
  "Getting banned from a buffet",
  "Challenging a bear to arm wrestling",
  "Stealing a police horse while drunk",
  "Wearing a fake mustache to a job interview",
  "Smuggling exotic ferrets in pants",
  "Faking a twin to skip work"
];

// Pure Fibbage-style fill-in-the-blank trivia
const fibbageQuestionBank = [
  {
    question: "In 2012, a man in New Zealand was arrested after calling emergency services to complain about ____.",
    answer: "bad weed quality",
    houseLies: ["his prostitute being late", "cold McDonald's fries", "a missing cat"]
  },
  {
    question: "Before inventing the telephone, Alexander Graham Bell suggested answering calls with ____.",
    answer: "Ahoy",
    houseLies: ["What's crackin'", "Howdy pardner", "Speak human"]
  },
  {
    question: "In 2017, a UK man legally changed his name to ____ after losing a drunk bet.",
    answer: "Bacon Double Cheeseburger",
    houseLies: ["Captain Underpants", "Lord Voldemort", "Sir Mix-A-Lot"]
  },
  {
    question: "In 1998, a French court ruled that employees could not be fired for ____ during work hours.",
    answer: "having a brief affair",
    houseLies: ["drinking wine", "napping under desks", "swearing at bosses"]
  },
  {
    question: "To discourage drunk driving, a bar in Texas required patrons to pass a ____ test before leaving.",
    answer: "unicycle riding",
    houseLies: ["tongue twister", "line dancing", "origami"]
  },
  {
    question: "In 2013, a man held up a bank in Chicago using a ____ as a weapon.",
    answer: "electric toothbrush",
    houseLies: ["frozen banana", "dildo", "guppy in a bag"]
  },
  {
    question: "In Switzerland, it is illegal to own only one ____ because they get lonely.",
    answer: "guinea pig",
    houseLies: ["goldfish", "parrot", "hamster"]
  },
  {
    question: "In 2015, police in Pennsylvania arrested a man for attempting to steal a ____ with a forklift.",
    answer: "whole ATM",
    houseLies: ["vending machine", "police cruiser", "Krispy Kreme dumpster"]
  },
  {
    question: "Until 2016, it was illegal in France for women to wear ____ without riding a bicycle or horse.",
    answer: "trousers",
    houseLies: ["high heels", "berets", "sunglasses"]
  },
  {
    question: "A man in Florida was arrested after trying to pay for his McDonald's order with ____.",
    answer: "a bag of weed",
    houseLies: ["a live alligator", "a stolen credit card statement", "Monopoly money"]
  },
  {
    question: "In 2011, a man was banned from an all-you-can-eat buffet after eating ____ plates of food.",
    answer: "12",
    houseLies: ["30", "50", "88"]
  },
  {
    question: "In Victoria, Australia, it was once illegal to change a lightbulb unless you were a licensed ____.",
    answer: "electrician",
    houseLies: ["plumber", "government agent", "magician"]
  },
  {
    question: "In 2018, a flight had to make an emergency landing because a passenger refused to stop ____.",
    answer: "farting",
    houseLies: ["singing Celine Dion", "doing pushups", "climbing seat covers"]
  },
  {
    question: "The town of Talkeetna, Alaska elected a ____ as its mayor for 20 years.",
    answer: "cat",
    houseLies: ["golden retriever", "goat", "wooden post"]
  },
  {
    question: "In 2007, a man accidentally traded a 3-carat diamond ring for a ____.",
    answer: "pepperoni pizza",
    houseLies: ["used toaster", "pack of cigarettes", "lottery ticket"]
  }
];

const cookieQuotes = {
  roundStart: [
    "Welcome back! Let's get some total lies on the board.",
    "Round starting! Try to make your lie sound convincing.",
    "Time for trivia! Make up something plausible."
  ],
  votingPhase: [
    "All lies are in! Let's see who cooked up the best garbage.",
    "Locked and loaded. Time to spot the truth from the bullshit."
  ],
  revealPhase: [
    "And the truth is revealed! Look at those points shift.",
    "Well, well... looks like someone actually knew the answer!"
  ]
};

function getCookieLine(category) {
  const lines = cookieQuotes[category];
  return lines[Math.floor(Math.random() * lines.length)];
}

function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function getNextQuestion(room) {
  // Filter out questions already used in this room session
  const available = fibbageQuestionBank.filter((_, idx) => !room.usedQuestions.includes(idx));
  
  // Reset index list if all questions were used
  if (available.length === 0) {
    room.usedQuestions = [];
    return fibbageQuestionBank[Math.floor(Math.random() * fibbageQuestionBank.length)];
  }

  const selected = available[Math.floor(Math.random() * available.length)];
  const originalIndex = fibbageQuestionBank.indexOf(selected);
  room.usedQuestions.push(originalIndex);
  
  return selected;
}

function clearRoomTimers(room) {
  if (room.timer) {
    clearInterval(room.timer);
    room.timer = null;
  }
}

function startPhaseTimer(room, duration, onTick, onExpire) {
  clearRoomTimers(room);
  room.timeLeft = duration;
  onTick(room.timeLeft);

  room.timer = setInterval(() => {
    room.timeLeft--;
    onTick(room.timeLeft);
    if (room.timeLeft <= 0) {
      clearRoomTimers(room);
      onExpire();
    }
  }, 1000);
}

function getMultiplier(round) {
  if (round <= 3) return 1;
  if (round <= 5) return 2;
  return 3;
}

function triggerVotingPhase(room, cleanCode) {
  clearRoomTimers(room);
  room.state = 'VOTING';
  
  Object.entries(room.players).forEach(([id, p]) => {
    if (!p.currentLie || p.currentLie.length === 0) {
      p.currentLie = fallbackLies[Math.floor(Math.random() * fallbackLies.length)];
    }
  });

  const rawOptions = [{ text: room.currentQuestion.answer, isCorrect: true, author: 'TRUTH' }];
  Object.entries(room.players).forEach(([id, p]) => {
    if (p.currentLie.length > 0) {
      rawOptions.push({ text: p.currentLie, isCorrect: false, author: id });
    }
  });

  if (room.currentQuestion.houseLies && room.currentQuestion.houseLies[0]) {
    rawOptions.push({ text: room.currentQuestion.houseLies[0], isCorrect: false, author: 'HOUSE' });
  }

  room.options = rawOptions.sort(() => Math.random() - 0.5);

  io.to(cleanCode).emit('startVoting', {
    question: room.currentQuestion.question,
    options: room.options,
    multiplier: room.multiplier,
    currentRound: room.currentRound,
    cookieLine: getCookieLine('votingPhase')
  });

  startPhaseTimer(
    room,
    45,
    (timeLeft) => io.to(cleanCode).emit('timerUpdate', { timeLeft, phase: 'VOTING' }),
    () => triggerRevealPhase(room, cleanCode)
  );
}

function triggerRevealPhase(room, cleanCode) {
  clearRoomTimers(room);
  room.state = 'REVEAL';
  
  const baseTruth = 1000 * room.multiplier;
  const baseFooled = 500 * room.multiplier;

  Object.entries(room.votes).forEach(([voterId, chosenIdx]) => {
    const chosenOption = room.options[chosenIdx];
    if (!chosenOption) return;
    if (chosenOption.isCorrect) {
      room.players[voterId].score += baseTruth;
    } else if (chosenOption.author !== 'HOUSE' && chosenOption.author !== voterId) {
      if (room.players[chosenOption.author]) {
        room.players[chosenOption.author].score += baseFooled;
      }
    }
  });

  io.to(cleanCode).emit('showReveal', {
    truth: room.currentQuestion.answer,
    options: room.options,
    votes: room.votes,
    players: room.players,
    currentRound: room.currentRound,
    multiplier: room.multiplier,
    isGameOver: room.currentRound >= 6,
    cookieLine: getCookieLine('revealPhase')
  });
}

io.on('connection', (socket) => {
  socket.on('createRoom', () => {
    const code = generateRoomCode();
    rooms[code] = {
      hostId: socket.id,
      players: {},
      state: 'LOBBY',
      currentRound: 0,
      multiplier: 1,
      currentQuestion: null,
      options: [],
      votes: {},
      usedQuestions: [],
      timer: null,
      timeLeft: 0
    };
    socket.join(code);
    socket.emit('roomCreated', { roomCode: code });
  });

  socket.on('joinRoom', ({ roomCode, name }) => {
    const cleanCode = roomCode ? roomCode.trim().toUpperCase() : '';
    const room = rooms[cleanCode];
    if (!room) return socket.emit('errorMsg', 'Room not found.');
    if (room.state !== 'LOBBY') return socket.emit('errorMsg', 'Game already in progress.');

    socket.join(cleanCode);
    room.players[socket.id] = { name, score: 0, currentLie: '' };
    socket.emit('joinedSuccess', { roomCode: cleanCode, name });
    io.to(room.hostId).emit('updatePlayers', Object.values(room.players));
  });

  socket.on('startRound', (roomCode) => {
    const cleanCode = roomCode ? roomCode.trim().toUpperCase() : '';
    const room = rooms[cleanCode];
    if (!room) return;

    if (room.currentRound >= 6) {
      room.currentRound = 0;
      Object.values(room.players).forEach(p => p.score = 0);
    }

    room.currentRound += 1;
    room.multiplier = getMultiplier(room.currentRound);
    room.state = 'SUBMITTING';
    room.votes = {};
    Object.keys(room.players).forEach(id => {
      room.players[id].currentLie = '';
    });

    const qData = getNextQuestion(room);
    room.currentQuestion = qData;

    io.to(cleanCode).emit('newRound', { 
      question: qData.question, 
      currentRound: room.currentRound,
      multiplier: room.multiplier,
      cookieLine: getCookieLine('roundStart')
    });

    startPhaseTimer(
      room,
      45,
      (timeLeft) => io.to(cleanCode).emit('timerUpdate', { timeLeft, phase: 'SUBMITTING' }),
      () => triggerVotingPhase(room, cleanCode)
    );
  });

  socket.on('submitLie', ({ roomCode, lie }) => {
    const cleanCode = roomCode ? roomCode.trim().toUpperCase() : '';
    const room = rooms[cleanCode];
    if (!room || !room.players[socket.id] || room.state !== 'SUBMITTING') return;

    room.players[socket.id].currentLie = lie.trim();

    const playersArray = Object.values(room.players);
    const submittedCount = playersArray.filter(p => p.currentLie.length > 0).length;

    io.to(room.hostId).emit('hostStatusUpdate', `Submitted: ${submittedCount} / ${playersArray.length}`);

    if (submittedCount === playersArray.length && playersArray.length > 0) {
      triggerVotingPhase(room, cleanCode);
    }
  });

  socket.on('submitVote', ({ roomCode, optionIndex }) => {
    const cleanCode = roomCode ? roomCode.trim().toUpperCase() : '';
    const room = rooms[cleanCode];
    if (!room || !room.players[socket.id] || room.state !== 'VOTING') return;

    room.votes[socket.id] = optionIndex;
    const playerIds = Object.keys(room.players);

    if (Object.keys(room.votes).length === playerIds.length && playerIds.length > 0) {
      triggerRevealPhase(room, cleanCode);
    }
  });

  socket.on('disconnect', () => {
    Object.keys(rooms).forEach(code => {
      const room = rooms[code];
      if (room.players[socket.id]) {
        delete room.players[socket.id];
        io.to(room.hostId).emit('updatePlayers', Object.values(room.players));
      }
    });
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));