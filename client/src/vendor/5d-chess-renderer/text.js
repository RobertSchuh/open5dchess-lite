import deepequal from 'fast-deep-equal';
import deepcopy from 'deepcopy';

class Text {
  constructor(PIXI) {
    this.PIXI = PIXI;

    //Create text storage
    this.texts = [];
  }
  getText(text, textOptions) {
    for(var i = 0;i < this.texts.length;i++) {
      if(this.texts[i].text === text.toString() && typeof this.texts[i].textObject !== 'undefined') {
        if(deepequal(this.texts[i].textOptions, textOptions)) {
          return this.texts[i];
        }
      }
    }
    var newText = {
      text: text.toString(),
      textOptions: deepcopy(textOptions),
      textObject: new this.PIXI.Text(text, textOptions)
    };
    newText.textObject.updateText();
    newText.baseTexture = newText.textObject.texture.castToBaseTexture();
    this.texts.push(newText);
    return newText;
  }
  get(text, textObject) {
    return new this.PIXI.Sprite(new this.PIXI.Texture(this.getText(text, textObject).baseTexture));
  }
  destroy() {
    //TODO Detect if no more users and destroy if needed
    for(var i = 0;i < this.texts.length;i++) {
      this.texts[i].textObject.destroy();
      this.texts.splice(i,1);
      i--;
    }
    this.texts = [];
  }
}

export default Text;