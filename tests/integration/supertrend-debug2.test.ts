import fs from 'fs';
import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';
import {
  ExecutionEngine,
  type ExecutionContext,
} from '../../src/language/runtime/execution-engine.js';
import { createSeries } from '../../src/language/runtime/series.js';

describe('SuperTrend AI K-means Debug', () => {
  it('tests k-means clustering in isolation', () => {
    const source = `
//@version=5
indicator("kmeans test")

type vector
    array<float> out

// Create 9 data points with distinct values to form 3 clusters
data = array.from(1.0, 2.0, 3.0, 10.0, 11.0, 12.0, 20.0, 21.0, 22.0)
factor_array = array.from(1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0)

maxIter = 50

// Initialize centroids from percentiles
centroids = array.new<float>(0)
centroids.push(data.percentile_linear_interpolation(25))
centroids.push(data.percentile_linear_interpolation(50))
centroids.push(data.percentile_linear_interpolation(75))

factors_clusters = array.from(vector.new(array.new<float>(0)), vector.new(array.new<float>(0)), vector.new(array.new<float>(0)))
perfclusters = array.from(vector.new(array.new<float>(0)), vector.new(array.new<float>(0)), vector.new(array.new<float>(0)))

for _ = 0 to maxIter
    factors_clusters := array.from(vector.new(array.new<float>(0)), vector.new(array.new<float>(0)), vector.new(array.new<float>(0)))
    perfclusters := array.from(vector.new(array.new<float>(0)), vector.new(array.new<float>(0)), vector.new(array.new<float>(0)))
    
    i = 0
    for value in data
        dist = array.new<float>(0)
        for centroid in centroids
            dist.push(math.abs(value - centroid))
        idx = dist.indexof(dist.min())
        perfclusters.get(idx).out.push(value)
        factors_clusters.get(idx).out.push(factor_array.get(i))
        i += 1

    new_centroids = array.new<float>(0)
    c = 0
    for cluster_ in perfclusters
        avg_val = cluster_.out.avg()
        new_centroids.push(na(avg_val) ? centroids.get(c) : avg_val)
        c += 1

    eps = 0.0000000001
    if math.abs(new_centroids.get(0) - centroids.get(0)) < eps and math.abs(new_centroids.get(1) - centroids.get(1)) < eps and math.abs(new_centroids.get(2) - centroids.get(2)) < eps
        break
    centroids := new_centroids

// Debug output
plot(centroids.get(0), "c0")
plot(centroids.get(1), "c1")
plot(centroids.get(2), "c2")

plot(factors_clusters.get(0).out.avg(), "f0_avg")
plot(factors_clusters.get(1).out.avg(), "f1_avg")
plot(factors_clusters.get(2).out.avg(), "f2_avg")

plot(factors_clusters.get(0).out.size(), "f0_size")
plot(factors_clusters.get(1).out.size(), "f1_size")
plot(factors_clusters.get(2).out.size(), "f2_size")
    `;

    const { ast } = parse(source);
    expect(ast).toBeDefined();

    const compiled = compile(ast);
    expect(compiled).toBeDefined();

    const engine = new ExecutionEngine(compiled);
    const bar = { timestamp: Date.now(), open: 100, high: 101, low: 99, close: 100, volume: 1000 };
    const ctx: ExecutionContext = {
      barIndex: 0,
      barCount: 1,
      timestamp: bar.timestamp,
      open: createSeries('open', [bar.open]),
      high: createSeries('high', [bar.high]),
      low: createSeries('low', [bar.low]),
      close: createSeries('close', [bar.close]),
      volume: createSeries('volume', [bar.volume]),
    };
    const result = engine.executeBar(ctx);

    if (!result.success) {
      console.log('Error:', result.error);
    }
    expect(result.success).toBe(true);

    if (result.success) {
      console.log('Output keys:', Array.from(result.outputs.keys()));
      for (const [key, series] of result.outputs) {
        console.log(`  ${key}:`, series.values);
      }

      // Centroids should be non-null
      const c0 = result.outputs.get('c0')?.values[0];
      const c1 = result.outputs.get('c1')?.values[0];
      const c2 = result.outputs.get('c2')?.values[0];
      console.log(`\nCentroids: c0=${c0} c1=${c1} c2=${c2}`);

      // Cluster sizes should be > 0
      const f0s = result.outputs.get('f0_size')?.values[0];
      const f1s = result.outputs.get('f1_size')?.values[0];
      const f2s = result.outputs.get('f2_size')?.values[0];
      console.log(`Cluster sizes: c0=${f0s} c1=${f1s} c2=${f2s}`);

      expect(c0).not.toBeNull();
      expect(c1).not.toBeNull();
      expect(c2).not.toBeNull();
      expect(f0s).toBeGreaterThan(0);
      expect(f1s).toBeGreaterThan(0);
      expect(f2s).toBeGreaterThan(0);
    }
  });
});
