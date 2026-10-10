import config from './config.js';
import Turn from './turn.js';
class Timeline {
  constructor(global, timelineObject = null) {
    this.global = global;
    this.emitter = this.global.emitter;
    this.timelineObject = {};
    this.turns = [];
    if(timelineObject !== null) {
      this.update(timelineObject);
    }
  }
  refresh() {
    for(var i = 0;i < this.turns.length;i++) {
      this.turns[i].refresh();
    }
  }
  update(timelineObject) {
    this.timelineObject = timelineObject;
    //Adding timeline to internal turn objects
    for(var j = 0;j < this.timelineObject.turns.length;j++) {
      this.timelineObject.turns[j].timeline = this.timelineObject.timeline;
    }
  
    //Looking in internal turns object to see if they still exist
    for(var i = 0;i < this.turns.length;i++) {
      var found = false;
      for(var j = 0;j < this.timelineObject.turns.length;j++) {
        if(
          this.turns[i].turnObject.turn === this.timelineObject.turns[j].turn &&
          this.turns[i].turnObject.player === this.timelineObject.turns[j].player
        ) {
          if(
            (this.turns[i].turnObject.player === 'white' && this.global.configStore.get('board').showWhite) ||
            (this.turns[i].turnObject.player === 'black' && this.global.configStore.get('board').showBlack)
          ) {
            //Show only of either not ghost or ghosts are allowed
            if(!this.turns[i].turnObject.ghost || this.global.configStore.get('board').showGhost) {
              found = true;
              this.turns[i].update(this.timelineObject.turns[j]);
            }
          }
        }
      }
      if(!found) {
        this.turns[i].destroy();
        this.turns.splice(i, 1);
        i--;
      }
    }
    
    //Looking in new timeline object for new turns to create
    for(var j = 0;j < this.timelineObject.turns.length;j++) {
      var found = false;
      for(var i = 0;i < this.turns.length;i++) {
        if(
          this.turns[i].turnObject.turn === this.timelineObject.turns[j].turn &&
          this.turns[i].turnObject.player === this.timelineObject.turns[j].player
        ) {
          found = true;
        }
      }
      if(!found) {
        if(
          (this.timelineObject.turns[j].player === 'white' && this.global.configStore.get('board').showWhite) ||
          (this.timelineObject.turns[j].player === 'black' && this.global.configStore.get('board').showBlack)
        ) {
          //Show only of either not ghost or ghosts are allowed
          if(!this.timelineObject.turns[j].ghost || this.global.configStore.get('board').showGhost) {
            this.turns.push(new Turn(this.global, this.timelineObject.turns[j]));
          }
        }
      }
    }
  }
  destroy() {
    for(var i = 0;i < this.turns.length;i++) {
      this.turns[i].destroy();
      this.turns.splice(i, 1);
      i--;
    }
    this.turns = [];
  }


  //redraw all children - called on palette update
  redraw() 
  {
    this.turns.forEach((v, i, a) => {v.redraw();});
  }
}

export default Timeline;