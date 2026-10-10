import StraightArrow from './straightArrow.js';
import CurvedArrow from './curvedArrow.js';
import * as positionFuncs from './position.js';
import * as utilsFuncs from './utils.js';
class CustomArrowManager {
  constructor(global) {
    this.global = global;
    this.emitter = this.global.emitter;

    this.eraseMode = false;
    this.middleMode = false;
    this.customColor = null;
    this.tmpArrowObject = null;
    this.tmpArrow;
    this.customArrowObjects = [];
    this.customArrows = [];

    this.emitter.on('configUpdate', this.update.bind(this));
    this.emitter.on('paletteUpdate', this.update.bind(this));
    this.emitter.on('squareTap', this.squareSelect.bind(this));
    this.emitter.on('squareOver', this.squareHover.bind(this));
  }
  enableCustomArrowMode(color = null, middleMode = true) {
    this.global.customArrowMode = true;
    if(color !== null) {
      this.customColor = color;
    }
    else {
      this.customColor = null;
    }
    this.middleMode = middleMode;
  }
  disableCustomArrowMode() {
    this.global.customArrowMode = false;
    this.eraseMode = false;
    this.middleMode = false;
    this.customColor = null;
    this.tmpArrowObject = null;
    if(typeof this.tmpArrow !== 'undefined') {
      this.tmpArrow.destroy();
      this.tmpArrow = undefined;
    }
  }
  enableEraseMode() {
    this.global.customArrowMode = true;
    this.eraseMode = true;
    this.middleMode = false;
    this.customColor = null;
    this.tmpArrowObject = null;
    if(typeof this.tmpArrow !== 'undefined') {
      this.tmpArrow.destroy();
      this.tmpArrow = undefined;
    }
  }
  disableEraseMode() {
    this.disableCustomArrowMode();
  }
  drawArrow(arrowObject) {
    /*
      Arrow Object:
        - type - string ('move', 'check', or 'custom') or number for custom
        - start - pos obj
        - middle - null or pos obj
        - end - pos obj
    */
    this.customArrowObjects.push(arrowObject);
    this.update();
  }
  undo() {
    if(this.customArrowObjects.length > 0) {
      this.customArrowObjects.splice(this.customArrowObjects.length - 1,1);
      this.update();
    }
  }
  wipe() {
    this.customArrowObjects = [];
    this.update();
  }
  update() {
    //Destroy extra arrows
    for(var i = this.customArrowObjects.length;i < this.customArrows.length;i++) {
      this.customArrows[i].destroy();
      this.customArrows.splice(i,1);
      i--;
    }

    //Update custom arrows
    for(var i = 0;i < this.customArrowObjects.length;i++) {
      var customArrowObject = this.customArrowObjects[i];
      var customArrow = this.customArrows[i];
      if(customArrowObject !== null && this.global.configStore.get('arrow').showCustom) {
        var curved = this.global.configStore.get('arrow').customCurved;
        customArrowObject.split = this.global.configStore.get('arrow').customSplitCurve;
        if(typeof customArrowObject.middle === 'object' && customArrowObject.middle !== null) {
          curved = this.global.configStore.get('arrow').customMiddleCurved;
          customArrowObject.split = this.global.configStore.get('arrow').customMiddleSplitCurve;
        }
        if(curved) {
          if(customArrow instanceof StraightArrow) {
            customArrow.destroy();
            customArrow = undefined;
          }
          if(typeof customArrow === 'undefined') {
            this.customArrows[i] = new CurvedArrow(this.global, customArrowObject);
          }
          else {
            customArrow.update(customArrowObject);
          }
        }
        else {
          if(customArrow instanceof CurvedArrow) {
            customArrow.destroy();
            customArrow = undefined;
          }
          if(typeof customArrow === 'undefined') {
            this.customArrows[i] = new StraightArrow(this.global, customArrowObject);
          }
          else {
            customArrow.update(customArrowObject);
          }
        }
      }
      else if(typeof customArrow !== 'undefined') {
        customArrow.destroy();
        customArrow = undefined;
      }
    }

    //Update temporary arrow
    if(this.tmpArrowObject !== null && this.tmpArrowObject.end !== null && this.global.configStore.get('arrow').showCustom) {
      var curved = this.global.configStore.get('arrow').customCurved;
      this.tmpArrowObject.split = this.global.configStore.get('arrow').customSplitCurve;
      if(typeof this.tmpArrowObject.middle === 'object' && this.tmpArrowObject.middle !== null) {
        curved = this.global.configStore.get('arrow').customMiddleCurved;
        this.tmpArrowObject.split = this.global.configStore.get('arrow').customMiddleSplitCurve;
      }
      if(curved) {
        if(this.tmpArrow instanceof StraightArrow) {
          this.tmpArrow.destroy();
          this.tmpArrow = undefined;
        }
        if(typeof this.tmpArrow === 'undefined') {
          this.tmpArrow = new CurvedArrow(this.global, this.tmpArrowObject);
        }
        else {
          this.tmpArrow.update(this.tmpArrowObject);
        }
      }
      else {
        if(this.tmpArrow instanceof CurvedArrow) {
          this.tmpArrow.destroy();
          this.tmpArrow = undefined;
        }
        if(typeof this.tmpArrow === 'undefined') {
          this.tmpArrow = new StraightArrow(this.global, this.tmpArrowObject);
        }
        else {
          this.tmpArrow.update(this.tmpArrowObject);
        }
      }
    }
    else if(typeof this.tmpArrow !== 'undefined') {
      this.tmpArrow.destroy();
      this.tmpArrow = undefined;
    }
  }
  squareSelect(event) {
    if(!this.global.customArrowMode) { return null; }
    if(this.eraseMode) {
      //Destroy closest arrow
      if(this.customArrowObjects.length > 0) {
        var sourceCoord = positionFuncs.toCoordinates(event.squareObject, this.global);
        var minDistance = Number.POSITIVE_INFINITY;
        var minIndex = -1;
        for(var i = 0;i < this.customArrowObjects.length;i++) {
          var customArrowObject = this.customArrowObjects[i];
          var startCoord = positionFuncs.toCoordinates(customArrowObject.start, this.global);
          var endCoord = positionFuncs.toCoordinates(customArrowObject.end, this.global);
          var middleCoord = null;
          if(customArrowObject.middle !== null) {
            middleCoord = positionFuncs.toCoordinates(customArrowObject.middle, this.global);
          }
          var getDistance = (coord1, coord2) => {
            return Math.sqrt(Math.pow(coord1.square.center.x - coord2.square.center.x, 2) + Math.pow(coord1.square.center.y - coord2.square.center.y, 2));
          };
          if(getDistance(sourceCoord, startCoord) < minDistance) {
            minDistance = getDistance(sourceCoord, startCoord);
            minIndex = i;
          }
          if(middleCoord !== null && getDistance(sourceCoord, middleCoord) < minDistance) {
            minDistance = getDistance(sourceCoord, middleCoord);
            minIndex = i;
          }
          if(getDistance(sourceCoord, endCoord) < minDistance) {
            minDistance = getDistance(sourceCoord, endCoord);
            minIndex = i;
          }
        }
        if(minIndex >= 0) {
          this.customArrowObjects.splice(minIndex, 1);
        }
      }
    }
    else {
      //Create arrows if not in erase mode
      if(this.tmpArrowObject === null) {
        this.tmpArrowObject = {
          type: this.customColor === null ? 'custom' : this.customColor,
          start: event.squareObject,
          middle: null,
          middleIsTmp: true,
          end: null,
          endIsTmp: true,
        };
      }
      else if(this.middleMode && (this.tmpArrowObject.middle === null || this.tmpArrowObject.middleIsTmp)) {
        //Cancel tmp arrow if clicking on same square as start
        if(utilsFuncs.squareObjectKey(event.squareObject) === utilsFuncs.squareObjectKey(this.tmpArrowObject.start)) {
          this.tmpArrowObject = null;
        }
        else {
          this.tmpArrowObject.middleIsTmp = false;
          this.tmpArrowObject.middle = event.squareObject;
        }
      }
      else if(this.middleMode && (this.tmpArrowObject.end === null || this.tmpArrowObject.endIsTmp)) {
        //Skip updating tmp arrow if clicking on same square as middle
        if(utilsFuncs.squareObjectKey(event.squareObject) === utilsFuncs.squareObjectKey(this.tmpArrowObject.middle)) {
          return null;
        }
        delete this.tmpArrowObject.middleIsTmp;
        delete this.tmpArrowObject.endIsTmp;
        this.tmpArrowObject.end = event.squareObject;
        this.customArrowObjects.push(this.tmpArrowObject);
        this.tmpArrowObject = null;
      }
      else if(!this.middleMode && (this.tmpArrowObject.end === null || this.tmpArrowObject.endIsTmp)) {
        //Cancel tmp arrow if clicking on same square as start
        if(utilsFuncs.squareObjectKey(event.squareObject) === utilsFuncs.squareObjectKey(this.tmpArrowObject.start)) {
          this.tmpArrowObject = null;
        }
        else {
          delete this.tmpArrowObject.middleIsTmp;
          delete this.tmpArrowObject.endIsTmp;
          this.tmpArrowObject.end = event.squareObject;
          this.customArrowObjects.push(this.tmpArrowObject);
          this.tmpArrowObject = null;
        }
      }
    }
    this.update();
  }
  squareHover(event) {
    if(!this.global.customArrowMode) { return null; }
    if(this.tmpArrowObject !== null) {
      if(this.middleMode && (this.tmpArrowObject.middle === null || this.tmpArrowObject.middleIsTmp)) {
        this.tmpArrowObject.end = event.squareObject;
      }
      else if(this.middleMode && (this.tmpArrowObject.end === null || this.tmpArrowObject.endIsTmp)) {
        this.tmpArrowObject.end = event.squareObject;
      }
      else if(!this.middleMode && (this.tmpArrowObject.end === null || this.tmpArrowObject.endIsTmp)) {
        this.tmpArrowObject.end = event.squareObject;
      }
    }
    this.update();
  }
}

export default CustomArrowManager;