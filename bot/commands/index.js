'use strict';

const general = require('./general');
const media = require('./media');
const tools = require('./tools');
const group = require('./group');
const owner = require('./owner');

const registry = new Map();

function register(cmds) {
  for (const [name, handler] of Object.entries(cmds)) {
    registry.set(name.toLowerCase(), handler);
    if (handler.aliases) {
      for (const alias of handler.aliases) {
        registry.set(alias.toLowerCase(), handler);
      }
    }
  }
}

register(general);
register(media);
register(tools);
register(group);
register(owner);

module.exports = registry;
