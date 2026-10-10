import Background from './background.js';
import Board from './board.js';
import ArrowManager from './arrowManager.js';
import CustomArrowManager from './customArrowManager.js';
import HighlightManager from './highlightManager.js';
import PixiFps from 'pixi-fps';
import { addStats } from 'pixi-stats';

class Render {
  constructor(global) {
    this.global = global;
    this.emitter = this.global.emitter;

    this.background = new Background(this.global);
    this.board = new Board(this.global);
    this.arrowManager = new ArrowManager(this.global);
    this.customArrowManager = new CustomArrowManager(this.global);
    this.highlightManager = new HighlightManager(this.global);

    this.fpsCounter;
    this.stats;
    this.emitter.on('configUpdate', this.update.bind(this));
    this.update();
  }
  update() {
    if(this.global.configStore.get('fps').show) {
      if(typeof this.fpsCounter === 'undefined') {
        this.fpsCounter = new PixiFps();
        this.global.app.stage.addChild(this.fpsCounter);
      }
      var textStyle = new this.global.PIXI.TextStyle(this.global.configStore.get('fps').fpsTextOptions);
      this.fpsCounter.style = textStyle;
    }
    else {
      if(typeof this.fpsCounter !== 'undefined') {
        this.global.app.stage.removeChild(this.fpsCounter);
        this.fpsCounter.destroy();
        this.fpsCounter = undefined;
      }
    }
    if(this.global.configStore.get('stats').show) {
      this.global.debug.enable();
      if(typeof this.stats === 'undefined') {
        this.stats = addStats(document, this.global.app);
        this.global.app.ticker.add(this.stats.update, this.stats, this.global.PIXI.UPDATE_PRIORITY.UTILITY);
      }
    }
    else {
      this.global.debug.disable();
    }
  }
}

export default Render;