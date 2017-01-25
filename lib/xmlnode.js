var Transform = require('stream').Transform;
var util = require('util');
var sax = require('sax');
var elem = require('./elem');
var debug = require('debug')('sax-stream');

module.exports = XmlNode;

function XmlNode(options) {
    if (!(this instanceof XmlNode)) {
        return new XmlNode(options);
    }

    Transform.call(this, {
        highWaterMark: options.highWaterMark || 350,
        objectMode: true
    });
    this.records = [];
    this.error = null;
    this.parser = this.createSaxParser(options);
}

util.inherits(XmlNode, Transform);

XmlNode.prototype.createSaxParser = function (options) {

    var self = this;
    var currentKey;
    var record;
    var parser = sax.parser(options.strict || false, prepareParserOptions(options));

    parser.onopentag = function (node) {
        currentKey = node.name;

        if (options.omitNsPrefix) currentKey = currentKey.split(':').pop();

        debug('Open "%s"', node.name);
        if (record) {
            record = elem.addChild(record, currentKey);
        }
        else if (node.name === options.tag) {
            record = {};
        }

        var attrKeys = Object.keys(node.attributes);

        if (record && attrKeys.length) {
            attrKeys.forEach(function (key) {

                var value = node.attributes[key];
                if (key in record) key = '_' + key;
                record[key] = value;
            });
        }
    };

    parser.onclosetag = function (tag) {
        debug('Closed "%s"', tag);
        if (tag === options.tag && !record.parent) {
            debug('Emitting record', record);

            if (!options.omitEmpty || elem.hasChilds(record)) {

                self.records.push(record);
            }
            record = undefined;
        } else if (record) {

            if (options.omitEmpty &&
                !elem.hasChilds(record) &&
                !isString(currentKey, record)) {
                removeChild(currentKey, record);
            }

            record = record.parent;
        }
    };

    parser.ontext = function (value) {
        if (record) {
            elem.addText(currentKey, record, value);
        }
    };

    parser.oncdata = function (value) {
        if (record) {
            elem.concatText(currentKey, record, value);
        }
    };

    parser.onerror = function (err) {
        self.error = err;
    };

    parser.onend = function () {
        debug('onend - flushing remaining items');
        self.pushAll(self.callback);
        self.callback = null;
    };

    return parser;
};

XmlNode.prototype.pushAll = function (callback) {
    if (this.error) {
        callback(this.error);
        this.error = null;
        return;
    }
    debug('pushing %d', this.records.length);
    this.records.forEach(this.push.bind(this));
    this.records.length = 0;
    callback();
};

XmlNode.prototype._transform = function (chunk, encoding, callback) {
    this.parser.write(chunk.toString());
    this.pushAll(callback);
};

XmlNode.prototype._flush = function (callback) {
    var self = this;
    self.callback = callback;
    self.parser.close();
};

function removeChild(key, node) {

    var target = node.parent[key];

    if (Array.isArray(target)) {
        var index = target.indexOf(node);
        if (index !== -1) {
            target.splice(index, 1);
        }
    } else {

        delete node.parent[key];
    }
}

function isString(key, node) {
    return typeof node.parent[key] === 'string';
}

function prepareParserOptions(options) {
    return [
        'trim',
        'normalize',
        'lowercase',
        'xmlns',
        'position',
        'strictEntities',
        'noscript'
    ].reduce(function (opts, name) {
        if (name in options) {
            opts[name] = options[name];
        }
        return opts;
    }, {
        position: false
    });
}
