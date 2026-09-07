const assert = require('node:assert/strict');

// 그룹 안의 모든 쌍별 간격이 다른 7개 위치다. 가까운 거리의 순서가 반올림에 가려지지 않게 한다.
const marks = [0, 1, 3, 7, 12, 20, 30];

function relatedVector(index, size) {
  assert(Number.isInteger(index) && index >= 0 && index < size);
  const groups = Math.ceil(size / marks.length);
  const angle =
    ((2 * Math.PI) / groups) *
    (Math.floor(index / marks.length) + marks[index % marks.length] / 70);
  const vector = Array.from({ length: 1536 }, () => 0);
  vector[0] = Math.cos(angle);
  vector[1] = Math.sin(angle);
  return vector;
}

module.exports = { relatedVector };
