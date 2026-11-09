import assert from "node:assert/strict";
import { test } from "node:test";
import { generateBoard } from "../assets/js/exhibit/generate.js";
import { Grid, polylineLength } from "../assets/js/exhibit/route.js";

test("routing respects blocked nodes and reports a closed path as unroutable", () => {
  const grid = new Grid(12, 12);
  grid.block(5, 0, 5, 8);
  const path = grid.route(2, 5, -1, 9, 5, -1, 1);
  assert(path);
  assert.deepEqual(path.slice(0, 2), [2, 5]);
  assert.deepEqual(path.slice(-2), [9, 5]);
  for (let i = 0; i < path.length; i += 2)
    assert(
      !(path[i] === 5 && path[i + 1] <= 8),
      "Route crossed a blocked node",
    );
  const sealed = new Grid(12, 12);
  sealed.block(5, 0, 5, 11);
  assert.equal(sealed.route(2, 5, -1, 9, 5, -1, 1), null);
});

test("a pinned revision reproduces its geometry", () => {
  const a = generateBoard(0x3fa2);
  const b = generateBoard(0x3fa2);
  assert.equal(a.rev, "3FA2");
  assert.deepEqual(a.layers, b.layers);
  assert.deepEqual(a.vias, b.vias);
});

test("multiple revisions have finite routes and connected vias", () => {
  for (const seed of [0, 1, 31, 255, 1024, 0x3fa2, 0x7d20, 0xffff]) {
    const board = generateBoard(seed);
    assert.equal(board.layers.length, 3);
    let count = 0;
    for (const layer of board.layers) {
      assert.equal(
        new Set(layer.nets.map((net) => net.id)).size,
        layer.nets.length,
      );
      for (const net of layer.nets) {
        count++;
        assert(net.points.length >= 4 && net.points.length % 2 === 0);
        assert(net.points.every(Number.isFinite));
        assert(Math.abs(polylineLength(net.points) - net.length) < 0.001);
        for (let i = 0; i < net.points.length; i += 2) {
          assert(net.points[i] >= 0 && net.points[i] < board.cols);
          assert(net.points[i + 1] >= 0 && net.points[i + 1] < board.rows);
        }
      }
    }
    assert.equal(count, board.stats.nets);
    assert.equal(board.vias.length, board.stats.vias);
    for (const via of board.vias) {
      assert(
        board.layers[via.lower].nets.some((net) => net.id === via.netBelow),
      );
      assert(
        board.layers[via.lower + 1].nets.some((net) => net.id === via.netAbove),
      );
    }
  }
});
