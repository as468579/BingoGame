'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { migrateRoom } = require('../domain/room-migration');

class JsonRoomRepository {
  constructor(directory) {
    fs.mkdirSync(directory, { recursive: true });
    this.file = path.join(directory, 'rooms.json');
    this.rooms = fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file, 'utf8')) : {};
    Object.values(this.rooms).forEach(migrateRoom);
  }

  get(code) { return Object.hasOwn(this.rooms, code) ? this.rooms[code] : undefined; }
  all() { return Object.values(this.rooms); }
  add(room) { this.rooms[room.code] = room; }

  save() {
    fs.writeFileSync(this.file + '.tmp', JSON.stringify(this.rooms));
    fs.renameSync(this.file + '.tmp', this.file);
  }
}

module.exports = { JsonRoomRepository };
