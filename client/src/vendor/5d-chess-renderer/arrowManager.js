import StraightArrow from './straightArrow.js';
import CurvedArrow from './curvedArrow.js';
import * as utilsFuncs from './utils.js';
class ArrowManager {
  constructor(global) {
    this.global = global;
    this.emitter = this.global.emitter;

    this.actionHistoryArrows = [];
    this.moveBufferArrows = [];
    this.checkArrows = [];

    this.emitter.on('actionHistoryUpdate', this.updateActionHistory.bind(this));
    this.emitter.on('moveBufferUpdate', this.updateMoveBuffer.bind(this));
    this.emitter.on('checksUpdate', this.updateChecks.bind(this));
    this.emitter.on('configUpdate', this.update.bind(this));
    this.emitter.on('paletteUpdate', this.update.bind(this));
  }
  isSpatial(move) {
    if(move.start.timeline !== move.end.timeline) { return false; }
    if(move.start.turn !== move.end.turn) { return false; }
    if(move.start.player !== move.end.player) { return false; }
    return true;
  }
  toArrowObject(moveObject) {
    var res = null;
    var isCurved = false;
    if(this.isSpatial(moveObject)) {
      isCurved = this.global.configStore.get('arrow').spatialCurved;
      if(this.global.configStore.get('arrow').showSpatial) {
        if(this.global.configStore.get('arrow').spatialMiddle) {
          res = {
            type: 'move',
            split: this.global.configStore.get('arrow').spatialSplitCurve,
            start: moveObject.start,
            middle: moveObject.end,
            end: moveObject.realEnd,
          };
        }
        else if(this.global.configStore.get('arrow').spatialRealEnd) {
          res = {
            type: 'move',
            split: this.global.configStore.get('arrow').spatialSplitCurve,
            start: moveObject.start,
            middle: null,
            end: moveObject.realEnd,
          };
        }
        else {
          res = {
            type: 'move',
            split: this.global.configStore.get('arrow').spatialSplitCurve,
            start: moveObject.start,
            middle: null,
            end: moveObject.end,
          };
        }
      }
    }
    else {
      isCurved = this.global.configStore.get('arrow').nonSpatialCurved;
      if(this.global.configStore.get('arrow').showNonSpatial) {
        if(this.global.configStore.get('arrow').nonSpatialMiddle) {
          res = {
            type: 'move',
            split: this.global.configStore.get('arrow').nonSpatialSplitCurve,
            start: moveObject.start,
            middle: moveObject.end,
            end: moveObject.realEnd,
          };
        }
        else if(this.global.configStore.get('arrow').nonSpatialRealEnd) {
          res = {
            type: 'move',
            split: this.global.configStore.get('arrow').nonSpatialSplitCurve,
            start: moveObject.start,
            middle: null,
            end: moveObject.realEnd,
          };
        }
        else {
          res = {
            type: 'move',
            split: this.global.configStore.get('arrow').nonSpatialSplitCurve,
            start: moveObject.start,
            middle: null,
            end: moveObject.end,
          };
        }
      }
    }
    if(res !== null) {
      res.curved = isCurved;
    }
    return res;
  }
  update() {
    this.updateActionHistory();
    this.updateMoveBuffer();
    this.updateChecks();
  }
  updateObjects() {
    //Grab latest moves from action history
    this.actionHistoryObjects = [];
    for(var i = 0;i < this.global.actionHistoryObjects.length;i++) {
      var currAction = this.global.actionHistoryObjects[i];
      for(var j = 0;j < currAction.moves.length;j++) {
        this.actionHistoryObjects.push(currAction.moves[j]);
      }
    }

    //Grab latest moves from move buffer
    this.moveBufferObjects = this.global.moveBufferObjects;

    //Grab latest moves from checks
    this.checkObjects = this.global.checkObjects;

    //Move arrows from move buffer to action history if needed
    for(var i = 0;i < this.actionHistoryObjects.length;i++) {
      var needsMoving = true;
      for(var j = 0;j < this.moveBufferObjects.length;j++) {
        if(
          this.toArrowObject(this.actionHistoryObjects[i]) !== null &&
          this.toArrowObject(this.moveBufferObjects[j]) !== null &&
          utilsFuncs.arrowObjectKey(this.toArrowObject(this.actionHistoryObjects[i])) === utilsFuncs.arrowObjectKey(this.toArrowObject(this.moveBufferObjects[j]))
        ) {
          needsMoving = false;
        }
      }
      if(needsMoving) {
        for(var j = 0;j < this.moveBufferArrows.length;j++) {
          if(
            this.toArrowObject(this.actionHistoryObjects[i]) !== null &&
            typeof this.moveBufferArrows[j] !== 'undefined' &&
            this.moveBufferArrows[j].arrowObject !== null &&
            utilsFuncs.arrowObjectKey(this.toArrowObject(this.actionHistoryObjects[i])) === utilsFuncs.arrowObjectKey(this.moveBufferArrows[j].arrowObject)
          ) {
            this.actionHistoryArrows[i] = this.moveBufferArrows[j];
            this.moveBufferArrows[j] = undefined;
            this.moveBufferArrows.splice(j, 1);
            j--;
          }
        }
      }
    }

    //Move arrows from action history to move buffer if needed
    for(var i = 0;i < this.moveBufferObjects.length;i++) {
      var needsMoving = true;
      for(var j = 0;j < this.actionHistoryObjects.length;j++) {
        if(
          this.toArrowObject(this.actionHistoryObjects[j]) !== null &&
          this.toArrowObject(this.moveBufferObjects[i]) !== null &&
          utilsFuncs.arrowObjectKey(this.toArrowObject(this.actionHistoryObjects[j])) === utilsFuncs.arrowObjectKey(this.toArrowObject(this.moveBufferObjects[i]))
        ) {
          needsMoving = false;
        }
      }
      if(needsMoving) {
        for(var j = 0;j < this.actionHistoryArrows.length;j++) {
          if(
            this.toArrowObject(this.moveBufferObjects[i]) !== null &&
            typeof this.actionHistoryArrows[j] !== 'undefined' && 
            this.actionHistoryArrows[j].arrowObject !== null &&
            utilsFuncs.arrowObjectKey(this.toArrowObject(this.moveBufferObjects[i])) === utilsFuncs.arrowObjectKey(this.actionHistoryArrows[j].arrowObject)
          ) {
            this.moveBufferArrows[i] = this.actionHistoryArrows[j];
            this.actionHistoryArrows[j] = undefined;
            this.actionHistoryArrows.splice(j, 1);
            j--;
          }
        }
      }
    }
  }
  updateActionHistory() {
    this.updateObjects();

    //Cull all extra arrows
    for(var i = this.actionHistoryObjects.length;i < this.actionHistoryArrows.length;i++) {
      if(typeof this.actionHistoryArrows[i] !== 'undefined') {
        this.actionHistoryArrows[i].destroy();
        this.actionHistoryArrows.splice(i, 1);
        i--;
      }
    }

    //Update arrows
    for(var i = 0;i < this.actionHistoryObjects.length;i++) {
      var currMove = this.actionHistoryObjects[i];
      var res = this.toArrowObject(currMove);
      var isCurved = res ? res.curved : false;
      if(!this.global.configStore.get('board').showWhite && res !== null) {
        if(
          res.start.player === 'white' ||
          (res.middle !== null && res.middle.player === 'white') ||
          res.end.player === 'white'
        ) {
          res = null;
        }
      }
      if(!this.global.configStore.get('board').showBlack && res !== null) {
        if(
          res.start.player === 'black' ||
          (res.middle !== null && res.middle.player === 'black') ||
          res.end.player === 'black'
        ) {
          res = null;
        }
      }
      if(typeof this.actionHistoryArrows[i] === 'undefined') {
        if(res !== null) {
          if(isCurved) {
            this.actionHistoryArrows[i] = new CurvedArrow(this.global, res);
          }
          else {
            this.actionHistoryArrows[i] = new StraightArrow(this.global, res);
          }
        }
      }
      else {
        if(res === null) {
          this.actionHistoryArrows[i].destroy();
        }
        else {
          if(isCurved && this.actionHistoryArrows[i] instanceof StraightArrow) {
            this.actionHistoryArrows[i].destroy();
            this.actionHistoryArrows[i] = undefined;
            this.actionHistoryArrows[i] = new CurvedArrow(this.global, res);
          }
          else if(!isCurved && this.actionHistoryArrows[i] instanceof CurvedArrow) {
            this.actionHistoryArrows[i].destroy();
            this.actionHistoryArrows[i] = undefined;
            this.actionHistoryArrows[i] = new StraightArrow(this.global, res);
          }
          else {
            this.actionHistoryArrows[i].update(res);
          }
        }
      }
    }
  }
  updateMoveBuffer() {
    this.updateObjects();

    //Cull all extra arrows
    for(var i = this.moveBufferObjects.length;i < this.moveBufferArrows.length;i++) {
      if(typeof this.moveBufferArrows[i] !== 'undefined') {
        this.moveBufferArrows[i].destroy();
        this.moveBufferArrows.splice(i, 1);
        i--;
      }
    }

    //Update arrows
    for(var i = 0;i < this.moveBufferObjects.length;i++) {
      var currMove = this.moveBufferObjects[i];
      var res = this.toArrowObject(currMove);
      var isCurved = res ? res.curved : false;
      if(!this.global.configStore.get('board').showWhite && res !== null) {
        if(
          res.start.player === 'white' ||
          (res.middle !== null && res.middle.player === 'white') ||
          res.end.player === 'white'
        ) {
          res = null;
        }
      }
      if(!this.global.configStore.get('board').showBlack && res !== null) {
        if(
          res.start.player === 'black' ||
          (res.middle !== null && res.middle.player === 'black') ||
          res.end.player === 'black'
        ) {
          res = null;
        }
      }
      if(typeof this.moveBufferArrows[i] === 'undefined') {
        if(res !== null) {
          if(isCurved) {
            this.moveBufferArrows[i] = new CurvedArrow(this.global, res);
          }
          else {
            this.moveBufferArrows[i] = new StraightArrow(this.global, res);
          }
        }
      }
      else {
        if(res === null) {
          this.moveBufferArrows[i].destroy();
        }
        else {
          if(isCurved && this.moveBufferArrows[i] instanceof StraightArrow) {
            this.moveBufferArrows[i].destroy();
            this.moveBufferArrows[i] = undefined;
            this.moveBufferArrows[i] = new CurvedArrow(this.global, res);
          }
          else if(!isCurved && this.moveBufferArrows[i] instanceof CurvedArrow) {
            this.moveBufferArrows[i].destroy();
            this.moveBufferArrows[i] = undefined;
            this.moveBufferArrows[i] = new StraightArrow(this.global, res);
          }
          else {
            this.moveBufferArrows[i].update(res);
          }
        }
      }
    }
  }
  updateChecks() {
    this.updateObjects();

    //Cull all extra arrows
    for(var i = this.checkObjects.length;i < this.checkArrows.length;i++) {
      if(typeof this.checkArrows[i] !== 'undefined') {
        this.checkArrows[i].destroy();
        this.checkArrows.splice(i, 1);
        i--;
      }
    }

    //Update arrows
    for(var i = 0;i < this.checkObjects.length;i++) {
      var currMove = this.checkObjects[i];
      var res = null;
      var isCurved = this.global.configStore.get('arrow').checkCurved;
      if(this.global.configStore.get('arrow').showCheck) {
        res = {
          type: 'check',
          split: false,
          start: currMove.start,
          middle: null,
          end: currMove.end,
        };
      }
      if(!this.global.configStore.get('board').showWhite && res !== null) {
        if(
          res.start.player === 'white' ||
          (res.middle !== null && res.middle.player === 'white') ||
          res.end.player === 'white'
        ) {
          res = null;
        }
      }
      if(!this.global.configStore.get('board').showBlack && res !== null) {
        if(
          res.start.player === 'black' ||
          (res.middle !== null && res.middle.player === 'black') ||
          res.end.player === 'black'
        ) {
          res = null;
        }
      }
      if(typeof this.checkArrows[i] === 'undefined') {
        if(res !== null) {
          if(isCurved) {
            this.checkArrows[i] = new CurvedArrow(this.global, res);
          }
          else {
            this.checkArrows[i] = new StraightArrow(this.global, res);
          }
        }
      }
      else {
        if(res === null) {
          this.checkArrows[i].destroy();
        }
        else {
          if(isCurved && this.checkArrows[i] instanceof StraightArrow) {
            this.checkArrows[i].destroy();
            this.checkArrows[i] = undefined;
            this.checkArrows[i] = new CurvedArrow(this.global, res);
          }
          else if(!isCurved && this.checkArrows[i] instanceof CurvedArrow) {
            this.checkArrows[i].destroy();
            this.checkArrows[i] = undefined;
            this.checkArrows[i] = new StraightArrow(this.global, res);
          }
          else {
            this.checkArrows[i].update(res);
          }
        }
      }
    }
  }
}

export default ArrowManager;