import test from "node:test";
import assert from "node:assert/strict";
import { currentLocation } from "../src/geolocation.js";

const position = (lat = 3.139, lng = 101.6869) => ({
  coords: { latitude: lat, longitude: lng, accuracy: 43.8 },
});
function browserLocation() {
  const requests = [],
    cleared = [];
  return {
    requests,
    cleared,
    watchPosition(success, error, options) {
      requests.push({ success, error, options });
      return requests.length - 1;
    },
    clearWatch(id) {
      cleared.push(id);
    },
  };
}

test("first available location includes accuracy and immediately stops observation", async () => {
  const geo = browserLocation();
  const result = currentLocation(geo);
  assert.deepEqual(geo.requests[0].options, {
    enableHighAccuracy: false,
    timeout: 10000,
    maximumAge: 60000,
  });
  geo.requests[0].success(position());
  assert.deepEqual(await result, {
    id: null,
    label: "My current location",
    lat: 3.139,
    lng: 101.6869,
    accuracy: 44,
  });
  assert.deepEqual(geo.cleared, [0]);
  geo.requests[0].success(position(4, 102));
  assert.equal(geo.requests.length, 1);
  assert.equal((await result).lat, 3.139);
});

for (const code of [2, 3]) {
  test(`error ${code} gets one longer fresh high-accuracy attempt`, async () => {
    const geo = browserLocation(),
      progress = [];
    const result = currentLocation(geo, {
      onProgress: (text) => progress.push(text),
    });
    geo.requests[0].error({ code });
    await Promise.resolve();
    assert.deepEqual(geo.cleared, [0]);
    assert.equal(geo.requests.length, 2);
    assert.deepEqual(geo.requests[1].options, {
      enableHighAccuracy: true,
      timeout: 30000,
      maximumAge: 0,
    });
    assert.match(progress[1], /30 more seconds/);
    geo.requests[0].success(position(0, 0)); // Late callbacks from the first attempt are ignored.
    geo.requests[1].success(position());
    assert.equal((await result).lat, 3.139);
    assert.deepEqual(geo.cleared, [0, 1]);
  });
}

test("permission denial stops immediately and explains site/device access and manual recovery", async () => {
  const geo = browserLocation();
  const result = currentLocation(geo);
  geo.requests[0].error({ code: 1 });
  await assert.rejects(
    result,
    (error) =>
      error.code === 1 &&
      /settings/.test(error.message) &&
      /map/.test(error.message),
  );
  assert.equal(geo.requests.length, 1);
  assert.deepEqual(geo.cleared, [0]);
});

test("two failures end the operation without endless retry or fabricated coordinates", async () => {
  const geo = browserLocation();
  const result = currentLocation(geo);
  geo.requests[0].error({ code: 3 });
  await Promise.resolve();
  geo.requests[1].error({ code: 3 });
  await assert.rejects(result, /after two attempts/);
  assert.equal(geo.requests.length, 2);
  assert.deepEqual(geo.cleared, [0, 1]);
});

test("a browser that never calls back is bounded to 40 seconds and both watches are cleared", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const geo = browserLocation();
  const result = currentLocation(geo);
  const rejected = assert.rejects(result, (error) => error.code === 3);
  t.mock.timers.tick(10000);
  await Promise.resolve();
  assert.equal(geo.requests.length, 2);
  t.mock.timers.tick(29999);
  assert.deepEqual(geo.cleared, [0]);
  t.mock.timers.tick(1);
  await rejected;
  assert.deepEqual(geo.cleared, [0, 1]);
});

test("cancelling stops the device request and discards late callbacks without retry", async () => {
  const geo = browserLocation(),
    controller = new AbortController();
  const result = currentLocation(geo, { signal: controller.signal });
  controller.abort();
  geo.requests[0].error({ code: 3 });
  geo.requests[0].success(position());
  await assert.rejects(result, { name: "AbortError" });
  assert.equal(geo.requests.length, 1);
  assert.deepEqual(geo.cleared, [0]);
});

test("cancellation during the retry clears its watch too", async () => {
  const geo = browserLocation(),
    controller = new AbortController();
  const result = currentLocation(geo, { signal: controller.signal });
  geo.requests[0].error({ code: 2 });
  await Promise.resolve();
  controller.abort();
  await assert.rejects(result, { name: "AbortError" });
  assert.deepEqual(geo.cleared, [0, 1]);
});

test("an already-cancelled request never asks for device location", async () => {
  const geo = browserLocation(),
    controller = new AbortController();
  controller.abort();
  await assert.rejects(currentLocation(geo, { signal: controller.signal }), {
    name: "AbortError",
  });
  assert.equal(geo.requests.length, 0);
});

test("unsupported and insecure browsers explain the cause and allow manual selection", async () => {
  await assert.rejects(currentLocation(null), /Search a place/);
  const geo = browserLocation();
  await assert.rejects(currentLocation(geo, { secureContext: false }), /HTTPS/);
  assert.equal(geo.requests.length, 0);
});

test("invalid or missing coordinates are rejected and the watch is released", async () => {
  for (const value of [position(NaN, 101), position(3, 200), {}, null]) {
    const geo = browserLocation();
    const result = currentLocation(geo);
    geo.requests[0].success(value);
    await assert.rejects(result, /reliable location/);
    assert.deepEqual(geo.cleared, [0]);
    assert.equal(geo.requests.length, 1);
  }
});

test("synchronous browser callbacks still release the returned watch ID", async () => {
  const cleared = [];
  const result = await currentLocation({
    watchPosition(success) {
      success(position());
      return 0;
    },
    clearWatch(id) {
      cleared.push(id);
    },
  });
  assert.equal(result.lat, 3.139);
  assert.deepEqual(cleared, [0]);
});
