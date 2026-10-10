import deepequal from 'fast-deep-equal';

import * as utilsFuncs from './utils.js';
import * as positionFuncs from './position.js';
import labelStrategy from './labelFactory.js';
class Label {
    constructor(global, labelObject = null, layer = null) {
        this.global = global;
        this.emitter = this.global.emitter;
        this.layer = this.global.layers.layers.labels;
        if (layer !== null) {
            this.layer = layer;
        }

        this.labelObject = {};
        this.alpha = 0;
        this.interactive = false;
        if (labelObject !== null) {
            this.update(labelObject);
        }
    }
    refresh() {
        this.destroy();
        this.update(this.labelObject);
    }

    //looks like this could really benefit from strategy classes
    update(labelObject) {
        //Assign labelObject to instance variables
        this.labelObject = labelObject;

        var coordinates = positionFuncs.toCoordinates(this.labelObject, this.global);
        /*
        if (this.labelObject.type === 'timelineL') {
            var textOptions = this.global.configStore.get('boardLabel').timelineTextOptions;
            textOptions.fill = this.global.paletteStore.get('boardLabel').timeline;
        }
        else if (this.labelObject.type === 'timelineR') {
            var textOptions = this.global.configStore.get('boardLabel').timelineTextOptions;
            textOptions.fill = this.global.paletteStore.get('boardLabel').timeline;
        }
        else if (this.labelObject.type === 'turn') {
            var textOptions = this.global.configStore.get('boardLabel').turnTextOptions;
            textOptions.fill = this.global.paletteStore.get('boardLabel').turn;
        }
        else if (this.labelObject.type === 'file') {
            var color = this.labelObject.player === 'white' ? this.global.paletteStore.get('boardLabel').whiteBoard : this.global.paletteStore.get('boardLabel').blackBoard;
            if (!this.labelObject.active) { color = this.global.paletteStore.get('boardLabel').inactiveBoard; }
            if (this.labelObject.check) { color = this.global.paletteStore.get('boardLabel').checkBoard; }
            var textOptions = this.global.configStore.get('boardLabel').fileTextOptions;
            textOptions.fill = color;
        }
        else if (this.labelObject.type === 'rank') {
            var color = this.labelObject.player === 'white' ? this.global.paletteStore.get('boardLabel').whiteBoard : this.global.paletteStore.get('boardLabel').blackBoard;
            if (!this.labelObject.active) { color = this.global.paletteStore.get('boardLabel').inactiveBoard; }
            if (this.labelObject.check) { color = this.global.paletteStore.get('boardLabel').checkBoard; }
            var textOptions = this.global.configStore.get('boardLabel').rankTextOptions;
            textOptions.fill = color;
        }
        */
       
        //get label strategy
        let strategy = labelStrategy.construct_labelStrategy(this.labelObject.type);
        //get textOptions
        var textOptions = strategy.getTextOptions(this.global, this.labelObject);

        //Load and animate text if needed
        if (
            positionFuncs.compare(coordinates, this.coordinates) !== 0 ||
            this.type !== this.labelObject.type ||
            !deepequal(this.textOptions, textOptions) ||
            this.color !== textOptions.fill
        ) {
            if (typeof this.text !== 'undefined') {
                this.destroy();
            }
            this.coordinates = coordinates;
            this.type = this.labelObject.type;
            this.color = textOptions.fill;

            this.key = utilsFuncs.squareObjectKey(this.labelObject);

            /*
            if (this.type === 'timelineL') {
                var text = this.labelObject.timeline + 'L';
                this.textOptions = this.global.configStore.get('boardLabel').timelineTextOptions;
                this.textOptions.fill = this.global.paletteStore.get('boardLabel').timeline;
                this.text = this.global.textStore.get(text, this.textOptions);
                this.text.anchor.set(0.5);
                var width = this.global.configStore.get('board').marginWidth - this.global.configStore.get('board').borderWidth;
                var height = this.coordinates.board.height;
                this.text.x = this.coordinates.boardWithMargins.x + width / 2;
                this.text.y = this.coordinates.board.y + height / 2;
                if (this.global.configStore.get('boardLabel').rotateTimelineLabel) {
                    this.text.angle = -90;
                }
            }
            else if (this.type === 'timelineR') {
                var text = this.labelObject.timeline + 'L';
                this.textOptions = this.global.configStore.get('boardLabel').timelineTextOptions;
                this.textOptions.fill = this.global.paletteStore.get('boardLabel').timeline;
                this.text = this.global.textStore.get(text, this.textOptions);
                this.text.anchor.set(0.5);
                var width = this.global.configStore.get('board').marginWidth - this.global.configStore.get('board').borderWidth;
                var height = this.coordinates.board.height;
                this.text.x = this.coordinates.board.x + this.coordinates.board.width + this.global.configStore.get('board').borderWidth + width / 2;
                this.text.y = this.coordinates.board.y + height / 2;
                if (this.global.configStore.get('boardLabel').rotateTimelineLabel) {
                    this.text.angle = 90;
                }
            }
            else if (this.type === 'turn') {
                var text = 'T' + this.labelObject.turn;
                this.textOptions = this.global.configStore.get('boardLabel').turnTextOptions;
                this.textOptions.fill = this.global.paletteStore.get('boardLabel').turn;
                this.text = this.global.textStore.get(text, this.textOptions);
                this.text.anchor.set(0.5);
                var width = this.coordinates.board.width;
                var height = this.global.configStore.get('board').marginHeight - this.global.configStore.get('board').borderHeight;
                this.text.x = this.coordinates.board.x + width / 2 + this.global.configStore.get('board').borderLineWidth;
                this.text.y = this.coordinates.boardWithMargins.y + height / 2;
            }
            else if (this.type === 'file') {
                var text = this.labelObject.coordinate.replace(/\d/g, '');
                var color = this.labelObject.player === 'white' ? this.global.paletteStore.get('boardLabel').whiteBoard : this.global.paletteStore.get('boardLabel').blackBoard;
                if (!this.labelObject.active) { color = this.global.paletteStore.get('boardLabel').inactiveBoard; }
                if (this.labelObject.check) { color = this.global.paletteStore.get('boardLabel').checkBoard; }
                this.textOptions = this.global.configStore.get('boardLabel').fileTextOptions;
                this.textOptions.fill = color;
                this.text = this.global.textStore.get(text, this.textOptions);
                this.text.anchor.set(0.5);
                var width = this.coordinates.square.width;
                var height = this.global.configStore.get('board').borderHeight - this.global.configStore.get('board').borderLineWidth;
                this.text.x = this.coordinates.square.x + width / 2;
                this.text.y = this.coordinates.board.y + this.coordinates.board.height + height / 2;
            }
            else if (this.type === 'rank') {
                var text = this.labelObject.rank;
                var color = this.labelObject.player === 'white' ? this.global.paletteStore.get('boardLabel').whiteBoard : this.global.paletteStore.get('boardLabel').blackBoard;
                if (!this.labelObject.active) { color = this.global.paletteStore.get('boardLabel').inactiveBoard; }
                if (this.labelObject.check) { color = this.global.paletteStore.get('boardLabel').checkBoard; }
                this.textOptions = this.global.configStore.get('boardLabel').rankTextOptions;
                this.textOptions.fill = color;
                this.text = this.global.textStore.get(text, this.textOptions);
                this.text.anchor.set(0.5);
                var height = this.coordinates.square.height;
                var width = this.global.configStore.get('board').borderWidth + this.global.configStore.get('board').borderLineWidth;
                this.text.x = this.coordinates.board.x - this.global.configStore.get('board').borderWidth + width / 2;
                this.text.y = this.coordinates.square.y + height / 2;
            }
            */

            //use the strategy here as well
            strategy.changeThisFunctionName(this);

            this.layer.addChild(this.text);

            //Initialize animation
            this.fadeIn();
        }
    }
    fadeIn() {
        this.text.alpha = 0;
        this.fadeDelay = this.global.configStore.get('ripple').timelineDuration * Math.abs(this.labelObject.timeline);
        this.fadeDelay += this.global.configStore.get('ripple').turnDuration * ((this.labelObject.turn * 2) + (this.labelObject.player === 'white' ? 0 : 1));
        this.fadeDelay += this.global.configStore.get('ripple').rankDuration * this.labelObject.rank;
        this.fadeDelay += this.global.configStore.get('ripple').fileDuration * this.labelObject.file;
        this.fadeLeft = this.global.configStore.get('boardLabel').fadeDuration;
        this.fadeDuration = this.fadeLeft;
        this.global.app.ticker.add(this.fadeInAnimate, this);
        this.global.debug.addActive({ key: this.key + '_label_fadein', type: 'ticker' });
    }
    fadeInAnimate(delta) {
        //Animate fading in
        if (this.fadeDelay > 0) {
            this.fadeDelay -= (delta / 60) * 1000;
            if (this.fadeDelay < 0) {
                this.fadeDelay = 0;
            }
        }
        else if (this.text && this.text.alpha < 1) {
            this.fadeLeft -= (delta / 60) * 1000;
            if (this.fadeLeft <= 0) {
                this.fadeLeft = 0;
                this.text.alpha = 1;
                this.global.app.ticker.remove(this.fadeInAnimate, this);
                this.global.debug.removeActive({ key: this.key + '_label_fadein', type: 'ticker' });
            }
            else {
                var progress = (this.fadeDuration - this.fadeLeft) / this.fadeDuration;
                this.text.alpha = progress;
            }
        }
    }
    destroy() {
        this.tmpCoordinates = this.coordinates;
        this.coordinates = undefined;
        if (typeof this.tmpText !== 'undefined') {
            this.tmpText.destroy();
        }
        this.tmpText = this.text;
        this.text = undefined;
        this.fadeDelay = 0;
        this.fadeDelay = this.global.configStore.get('ripple').timelineDuration * Math.abs(this.labelObject.timeline);
        this.fadeDelay += this.global.configStore.get('ripple').turnDuration * ((this.labelObject.turn * 2) + (this.labelObject.player === 'white' ? 0 : 1));
        this.fadeDelay += this.global.configStore.get('ripple').rankDuration * this.labelObject.rank;
        this.fadeDelay += this.global.configStore.get('ripple').fileDuration * this.labelObject.file;
        this.fadeLeft = this.global.configStore.get('boardLabel').fadeDuration;
        this.fadeDuration = this.fadeLeft;
        this.global.app.ticker.add(this.fadeOutAnimate, this);
        this.global.debug.addActive({ key: this.key + '_label_fadeout', type: 'ticker' });
    }
    fadeOutAnimate(delta) {
        //Animate fading out
        if (this.fadeDelay > 0) {
            this.fadeDelay -= (delta / 60) * 1000;
            if (this.fadeDelay < 0) {
                this.fadeDelay = 0;
            }
        }
        else if (typeof this.tmpText !== 'undefined' && this.tmpText.alpha > 0) {
            this.fadeLeft -= (delta / 60) * 1000;
            if (this.fadeLeft <= 0) {
                this.fadeLeft = 0;
                this.tmpText.destroy();
                this.tmpText = undefined;
                this.tmpCoordinates = undefined;
                this.global.app.ticker.remove(this.fadeOutAnimate, this);
                this.global.debug.removeActive({ key: this.key + '_label_fadeout', type: 'ticker' });
            }
            else {
                var progress = 1 - ((this.fadeDuration - this.fadeLeft) / this.fadeDuration);
                this.tmpText.alpha = progress;
            }
        }
    }

    redraw() {
        /*
        //make a call to update - i dont want to change anything
        //I also dont want to call this.destroy()

        //delete the old pixi object
        this.text.destroy();

        //update the text
        //does not actually update the text
        this.update(this.labelObject);
        */

        //try refresh instead
        //this.refresh();
        //didnt really work either
    }
}

export default Label;