const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;
const rooms = new Map();
const W = 960, H = 600, R = 17;
const COLORS = ["#ff6b6b","#ffd166","#06d6a0","#4cc9f0","#c77dff","#f78c6b","#90be6d","#f15bb5"];

function code() { return crypto.randomBytes(3).toString("hex").toUpperCase(); }
function cleanName(s) { return String(s || "Player").replace(/[<>]/g,"").trim().slice(0,16) || "Player"; }
function roomView(room) {
  return {
    code: room.code, phase: room.phase, round: room.round,
    players: [...room.players.values()].map(p => ({
      id:p.id, name:p.name, x:p.x, y:p.y, color:p.color, alive:p.alive,
      hasBomb:p.id===room.bombHolder, shield:p.shield, speedUntil:p.speedUntil
    })),
    bombHolder: room.bombHolder, bombTime: room.bombTime,
    winner: room.winner, message: room.message, powerups: room.powerups,
    arenaRadius: room.arenaRadius, arenaCenter:{x:W/2,y:H/2}
  };
}
function emit(room) { io.to(room.code).emit("state", roomView(room)); }
function makeRoom(host, name) {
  let c; do { c=code(); } while(rooms.has(c));
  const room = {code:c, host, players:new Map(), phase:"lobby", round:0,
    bombHolder:null, bombTime:0, winner:null, message:"Waiting for players...",
    powerups:[], arenaRadius:270, lastPowerup:Date.now(), lastTick:Date.now()};
  rooms.set(c, room);
  addPlayer(room, host, name);
  return room;
}
function addPlayer(room, socketId, name) {
  if (room.players.size >= 8) return null;
  const i=room.players.size;
  const p={id:socketId,name:cleanName(name),x:W/2+Math.cos(i*Math.PI/4)*160,
    y:H/2+Math.sin(i*Math.PI/4)*130,color:COLORS[i%COLORS.length],
    alive:true,shield:false,speedUntil:0,input:{x:0,y:0,sprint:false}};
  room.players.set(socketId,p);
  return p;
}
function start(room) {
  const alive=[...room.players.values()].filter(p=>p.alive);
  if(alive.length<2) return false;
  room.phase="playing"; room.round++;
  room.winner=null; room.arenaRadius=270;
  room.powerups=[];
  for(const p of alive){p.alive=true;p.shield=false;p.x=W/2+(Math.random()-.5)*320;p.y=H/2+(Math.random()-.5)*220;}
  room.bombHolder=alive[Math.floor(Math.random()*alive.length)].id;
  room.bombTime=14+Math.random()*7;
  room.message="Pass the bomb! Don't be the last one holding it.";
  room.lastTick=Date.now();
  return true;
}
function endRound(room, winner) {
  room.phase="ended"; room.winner=winner?.id || null;
  room.message=winner ? `${winner.name} wins the round!` : "Nobody survived!";
  room.bombHolder=null; room.bombTime=0;
}
function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
function tick(room, dt) {
  if(room.phase!=="playing") return;
  const now=Date.now();
  const alive=[...room.players.values()].filter(p=>p.alive);
  for(const p of alive) {
    const len=Math.hypot(p.input.x,p.input.y)||1;
    const speed=(p.input.sprint && p.speedUntil>now ? 250 : (p.speedUntil>now ? 205 : 175));
    p.x += p.input.x/len*speed*dt;
    p.y += p.input.y/len*speed*dt;
    const dx=p.x-W/2, dy=p.y-H/2, d=Math.hypot(dx,dy);
    const max=room.arenaRadius-R;
    if(d>max){p.x=W/2+dx/d*max;p.y=H/2+dy/d*max;}
  }
  // A single authoritative transfer per tick prevents duplicate bomb ownership.
  const holder=room.players.get(room.bombHolder);
  if(holder && holder.alive) {
    for(const p of alive) {
      if(p.id!==holder.id && dist(p,holder)<R*2+5) {
        if(p.shield){p.shield=false; room.message=`${p.name}'s shield blocked the pass!`;}
        else {
          room.bombHolder=p.id;
          room.bombTime=Math.max(4,room.bombTime);
          room.message=`${holder.name} passed the bomb to ${p.name}!`;
        }
        break;
      }
    }
  }
  room.bombTime-=dt;
  if(room.bombTime<=0) {
    const victim=room.players.get(room.bombHolder);
    if(victim) victim.alive=false;
    room.message=victim ? `${victim.name} got blown up!` : "BOOM!";
    const remaining=[...room.players.values()].filter(p=>p.alive);
    if(remaining.length<=1) endRound(room,remaining[0]);
    else {
      room.bombHolder=remaining[Math.floor(Math.random()*remaining.length)].id;
      room.bombTime=12+Math.random()*8;
    }
  }
  // Collectible power-ups: shield or speed.
  if(now-room.lastPowerup>7000 && room.powerups.length<3) {
    room.powerups.push({id:crypto.randomBytes(3).toString("hex"),x:W/2+(Math.random()-.5)*360,y:H/2+(Math.random()-.5)*260,type:Math.random()<.5?"shield":"speed"});
    room.lastPowerup=now;
  }
  for(const pu of [...room.powerups]) {
    for(const p of alive) if(dist(p,pu)<R+15) {
      if(pu.type==="shield") p.shield=true; else p.speedUntil=now+5000;
      room.powerups=room.powerups.filter(x=>x.id!==pu.id);
      room.message=pu.type==="shield"?`${p.name} collected a shield!`:`${p.name} got a speed boost!`;
      break;
    }
  }
  room.arenaRadius=Math.max(145,room.arenaRadius-dt*1.25);
}
setInterval(()=>{
  const now=Date.now();
  for(const room of rooms.values()) {
    const dt=Math.min(.05,(now-room.lastTick)/1000); room.lastTick=now;
    const previousPhase=room.phase;
    tick(room,dt);
    if(room.phase==="playing" || room.phase!==previousPhase) emit(room);
  }
},50);

io.on("connection", socket=>{
  socket.on("createRoom", ({name}={})=>{
    const room=makeRoom(socket.id,name);
    socket.join(room.code); socket.data.room=room.code;
    socket.emit("joined",{code:room.code,host:true}); emit(room);
  });
  socket.on("joinRoom", ({code:c,name}={})=>{
    const room=rooms.get(String(c||"").toUpperCase());
    if(!room){socket.emit("errorMessage","Room not found.");return;}
    if(room.phase==="playing"){socket.emit("errorMessage","That match has already started.");return;}
    if(room.players.size>=8){socket.emit("errorMessage","Room is full (8 players maximum).");return;}
    const p=addPlayer(room,socket.id,name);
    if(!p){socket.emit("errorMessage","Could not join room.");return;}
    socket.join(room.code); socket.data.room=room.code;
    socket.emit("joined",{code:room.code,host:false}); emit(room);
  });
  socket.on("startGame",()=>{
    const room=rooms.get(socket.data.room);
    if(!room || room.host!==socket.id){socket.emit("errorMessage","Only the host can start.");return;}
    if(!start(room)){socket.emit("errorMessage","At least 2 players are needed.");return;}
    emit(room);
  });
  socket.on("input",input=>{
    const room=rooms.get(socket.data.room); const p=room?.players.get(socket.id);
    if(!p || !p.alive || room.phase!=="playing")return;
    p.input={x:Math.max(-1,Math.min(1,Number(input?.x)||0)),y:Math.max(-1,Math.min(1,Number(input?.y)||0)),sprint:!!input?.sprint};
  });
  socket.on("rematch",()=>{
    const room=rooms.get(socket.data.room);
    if(!room || room.phase!=="ended")return;
    if(room.host!==socket.id)return;
    start(room); emit(room);
  });
  socket.on("disconnect",()=>{
    const c=socket.data.room, room=rooms.get(c); if(!room)return;
    room.players.delete(socket.id);
    if(room.bombHolder===socket.id) {
      const next=[...room.players.values()].find(p=>p.alive);
      room.bombHolder=next?.id||null;
    }
    if(room.players.size===0) rooms.delete(c);
    else {
      if(room.host===socket.id) room.host=room.players.keys().next().value;
      const alive=[...room.players.values()].filter(p=>p.alive);
      if(room.phase==="playing" && alive.length<=1) endRound(room,alive[0]);
      emit(room);
    }
  });
});

server.listen(PORT,()=>console.log(`Bomb Squad running at http://localhost:${PORT}`));
