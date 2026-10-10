import { AbstractRenderer } from 'pixi.js';


class labelStrategy {
    constructor() {
        if (this.constructor == labelStrategy) {
            throw new Error("Abstract classes can't be instantiated.");
        }
    }

    getTextOptions(global, labelObject) {
        throw new Error("Method 'getTextOptions()' must be implemented.");
    }

    //parameter is just a reference
    //i didnt want to try with params on this one
    changeThisFunctionName(label) {
        throw new Error("this Method must be implemented.");
    }
}

class label_timelineL extends labelStrategy {
    getTextOptions(global, labelObject) {
        //if (this.labelObject.type === 'timelineL')
        let textOptions = global.configStore.get('boardLabel').timelineTextOptions;
        textOptions.fill = global.paletteStore.get('boardLabel').timeline;
        return textOptions;
    }

    changeThisFunctionName(label) {
        //if (this.type === 'timelineL')
        var text = label.labelObject.timeline + 'L';
        label.textOptions = label.global.configStore.get('boardLabel').timelineTextOptions;
        label.textOptions.fill = label.global.paletteStore.get('boardLabel').timeline;
        label.text = label.global.textStore.get(text, label.textOptions);
        label.text.anchor.set(0.5);
        var width = label.global.configStore.get('board').marginWidth - label.global.configStore.get('board').borderWidth;
        var height = label.coordinates.board.height;
        label.text.x = label.coordinates.boardWithMargins.x + width / 2;
        label.text.y = label.coordinates.board.y + height / 2;
        if (label.global.configStore.get('boardLabel').rotateTimelineLabel) {
            label.text.angle = -90;
        }
        //return text;
    }
}

class label_timelineR extends labelStrategy {
    getTextOptions(global, labelObject) {
        //else if (this.labelObject.type === 'timelineR') {
        let textOptions = global.configStore.get('boardLabel').timelineTextOptions;
        textOptions.fill = global.paletteStore.get('boardLabel').timeline;
        return textOptions;
    }

    changeThisFunctionName(label) {
        //else if (this.type === 'timelineR') {
        var text = label.labelObject.timeline + 'L';
        label.textOptions = label.global.configStore.get('boardLabel').timelineTextOptions;
        label.textOptions.fill = label.global.paletteStore.get('boardLabel').timeline;
        label.text = label.global.textStore.get(text, label.textOptions);
        label.text.anchor.set(0.5);
        var width = label.global.configStore.get('board').marginWidth - label.global.configStore.get('board').borderWidth;
        var height = label.coordinates.board.height;
        label.text.x = label.coordinates.board.x + label.coordinates.board.width + label.global.configStore.get('board').borderWidth + width / 2;
        label.text.y = label.coordinates.board.y + height / 2;
        if (label.global.configStore.get('boardLabel').rotateTimelineLabel) {
            label.text.angle = 90;
        }
        //return text;
    }
}

class label_turn extends labelStrategy {
    getTextOptions(global, labelObject) {
        //else if (this.labelObject.type === 'turn') {
        let textOptions = global.configStore.get('boardLabel').turnTextOptions;
        textOptions.fill = global.paletteStore.get('boardLabel').turn;
        return textOptions;
    }

    changeThisFunctionName(label) {
        //else if (this.type === 'turn') {
        var text = 'T' + label.labelObject.turn;
        label.textOptions = label.global.configStore.get('boardLabel').turnTextOptions;
        label.textOptions.fill = label.global.paletteStore.get('boardLabel').turn;
        label.text = label.global.textStore.get(text, label.textOptions);
        label.text.anchor.set(0.5);
        var width = label.coordinates.board.width;
        var height = label.global.configStore.get('board').marginHeight - label.global.configStore.get('board').borderHeight;
        label.text.x = label.coordinates.board.x + width / 2 + label.global.configStore.get('board').borderLineWidth;
        label.text.y = label.coordinates.boardWithMargins.y + height / 2;
        //return text;
    }
}

class label_file extends labelStrategy {
    getTextOptions(global, labelObject) {
        //else if (this.labelObject.type === 'file') {
        let color = labelObject.player == 'white' ? global.paletteStore.get('boardLabel').whiteBoard : global.paletteStore.get('boardLabel').blackBoard;
        if (!labelObject.active) { color = global.paletteStore.get('boardLabel').inactiveBoard; }
        if (labelObject.check) { color = global.paletteStore.get('boardLabel').checkBoard; }
        let textOptions = global.configStore.get('boardLabel').fileTextOptions;
        textOptions.fill = color;
        return textOptions;
    }

    changeThisFunctionName(label) {
        //else if (this.type === 'file') {
        var text = label.labelObject.coordinate.replace(/\d/g, '');
        var color = label.labelObject.player === 'white' ? label.global.paletteStore.get('boardLabel').whiteBoard : label.global.paletteStore.get('boardLabel').blackBoard;
        if (!label.labelObject.active) { color = label.global.paletteStore.get('boardLabel').inactiveBoard; }
        if (label.labelObject.check) { color = label.global.paletteStore.get('boardLabel').checkBoard; }
        label.textOptions = label.global.configStore.get('boardLabel').fileTextOptions;
        label.textOptions.fill = color;
        label.text = label.global.textStore.get(text, label.textOptions);
        label.text.anchor.set(0.5);
        var width = label.coordinates.square.width;
        var height = label.global.configStore.get('board').borderHeight - label.global.configStore.get('board').borderLineWidth;
        label.text.x = label.coordinates.square.x + width / 2;
        label.text.y = label.coordinates.board.y + label.coordinates.board.height + height / 2;
        //return text
    }
}

class label_rank extends labelStrategy {
    getTextOptions(global, labelObject) {
        //else if (this.labelObject.type === 'rank') {
        let color = labelObject.player === 'white' ? global.paletteStore.get('boardLabel').whiteBoard : global.paletteStore.get('boardLabel').blackBoard;
        if (!labelObject.active) { color = global.paletteStore.get('boardLabel').inactiveBoard; }
        if (labelObject.check) { color = global.paletteStore.get('boardLabel').checkBoard; }
        let textOptions = global.configStore.get('boardLabel').rankTextOptions;
        textOptions.fill = color;
        return textOptions;
    }

    changeThisFunctionName(label) {
        //else if (this.type === 'rank') {
        var text = label.labelObject.rank;
        var color = label.labelObject.player === 'white' ? label.global.paletteStore.get('boardLabel').whiteBoard : label.global.paletteStore.get('boardLabel').blackBoard;
        if (!label.labelObject.active) { color = label.global.paletteStore.get('boardLabel').inactiveBoard; }
        if (label.labelObject.check) { color = label.global.paletteStore.get('boardLabel').checkBoard; }
        label.textOptions = label.global.configStore.get('boardLabel').rankTextOptions;
        label.textOptions.fill = color;
        label.text = label.global.textStore.get(text, label.textOptions);
        label.text.anchor.set(0.5);
        var height = label.coordinates.square.height;
        var width = label.global.configStore.get('board').borderWidth + label.global.configStore.get('board').borderLineWidth;
        label.text.x = label.coordinates.board.x - label.global.configStore.get('board').borderWidth + width / 2;
        label.text.y = label.coordinates.square.y + height / 2;
        //return text
    }
}

class LabelFactory {
    static construct_labelStrategy(type) {
        let labelStrategy = undefined;
        if (type === 'timelineL')
            labelStrategy = new label_timelineL();
        else if (type === 'timelineR')
            labelStrategy = new label_timelineR();
        else if (type === 'turn')
            labelStrategy = new label_turn();
        else if (type === 'file')
            labelStrategy = new label_file();
        else if (type === 'rank')
            labelStrategy = new label_rank();
        return labelStrategy;
    }
}

export default LabelFactory;