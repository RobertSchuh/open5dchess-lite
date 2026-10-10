import Timeline from './timeline.js';
class Board {
  constructor(global) {
    this.global = global;
    this.viewport = this.global.viewport;
    this.layers = this.global.layers.layers;
    this.emitter = this.global.emitter;
    this.boardObject = this.global.boardObject;
    this.timelines = [];
    this.update();

    this.listeners = [
      this.emitter.on('boardUpdate', this.refresh.bind(this)),
      this.emitter.on('configUpdate', this.refresh.bind(this)),
      this.emitter.on('paletteUpdate', this.refresh.bind(this)),

      //when the palette updates then redraw the boards?
      this.emitter.on('paletteUpdate', this.redraw.bind(this))
    ];
  }
  refresh() {
    this.update();
  }
  update() {
    this.boardObject = this.global.boardObject;
    if(this.boardObject === null || typeof this.boardObject === 'undefined') {
      return null;
    }
    
    //Looking in internal timelines object to see if they still exist
    for(var i = 0;i < this.timelines.length;i++) {
      var found = false;
      for(var j = 0;j < this.boardObject.timelines.length;j++) {
        if(this.timelines[i].timelineObject.timeline === this.boardObject.timelines[j].timeline) {
          found = true;
          this.timelines[i].update(this.boardObject.timelines[j]);
        }
      }
      if(!found) {
        this.timelines[i].destroy();
        this.timelines.splice(i, 1);
        i--;
      }
    }
    //Looking in new board object for new timelines to create
    for(var j = 0;j < this.boardObject.timelines.length;j++) {
      var found = false;
      for(var i = 0;i < this.timelines.length;i++) {
        if(this.timelines[i].timelineObject.timeline === this.boardObject.timelines[j].timeline) {
          found = true;
        }
      }
      if(!found) {
        this.timelines.push(new Timeline(this.global, this.boardObject.timelines[j]));
      }
    }
  }
  destroy(removeListeners = true) {
    for(var i = 0;i < this.timelines.length;i++) {
      this.timelines[i].destroy();
      this.timelines.splice(i, 1);
      i--;
    }
    this.timelines = [];
    if(removeListeners) {
      if(Array.isArray(this.listeners)) {
        while(this.listeners.length > 0) {
          if(typeof this.listeners[0] === 'function') {
            this.listeners[0]();
          }
          this.listeners.splice(0,1);
        }
      }
    }
  }

  //redraw all children - called on palette update (maybe implement some sort of logic to check only the board palette for an update)
  redraw()
  {
    this.timelines.forEach((v, i, a) => {v.redraw();})
  }
}

export default Board;