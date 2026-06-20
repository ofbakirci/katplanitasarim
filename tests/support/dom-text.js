function nodeText(node) {
  if (!node) return '';
  const own = typeof node.textContent === 'string' ? node.textContent : '';
  const kids = Array.isArray(node.children) ? node.children.map(nodeText).join(' ') : '';
  return `${own} ${kids}`.replace(/\s+/g, ' ').trim();
}

module.exports = { nodeText };
