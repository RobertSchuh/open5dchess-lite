import Global from './global.js';
import Render from './render.js';
import Selector from './selector.js';
import ZoomManager from './zoomManager.js';
class ChessRenderer {
  constructor(customElement = null, customConfig = null, customPalette = null, customPIXI = null, customTexture = null) {
    this.global = new Global(customConfig, customPalette, customPIXI, customTexture);
    this.render = new Render(this.global);
    this.selector = new Selector(this.global);
    this.zoom = new ZoomManager(this.global);
    
    if(customElement !== null) {
      this.global.attach(customElement);
    }
  }
  on(event, callback) {
    return this.global.emitter.on(event, callback);
  }
  destroy() {
    this.global.destroy();
  }
}

export default ChessRenderer;