import { LayoutManager } from '../../frontend/src/chart/LayoutManager.js';

describe('LayoutManager Indicator Panes', () => {
  describe('calculate() with indicator panes', () => {
    it('should allocate no indicator panes when indicatorCount is 0', () => {
      const layout = new LayoutManager(70, 30, 0.2);
      const regions = layout.calculate(1000, 600, 0);

      expect(regions.indicatorPanes).toHaveLength(0);
      expect(regions.chartArea.height).toBeGreaterThan(0);
    });

    it('should allocate one indicator pane when indicatorCount is 1', () => {
      const layout = new LayoutManager(70, 30, 0.2);
      const regions = layout.calculate(1000, 600, 1);

      expect(regions.indicatorPanes).toHaveLength(1);
      expect(regions.indicatorPanes[0]!.height).toBeGreaterThan(0);
      expect(regions.indicatorPanes[0]!.y).toBeGreaterThan(regions.chartArea.y);
    });

    it('should allocate two indicator panes when indicatorCount is 2', () => {
      const layout = new LayoutManager(70, 30, 0.2);
      const regions = layout.calculate(1000, 600, 2);

      expect(regions.indicatorPanes).toHaveLength(2);
      expect(regions.indicatorPanes[1]!.y).toBeGreaterThan(regions.indicatorPanes[0]!.y);
    });

    it('should stack indicator panes below volume area', () => {
      const layout = new LayoutManager(70, 30, 0.2);
      const regions = layout.calculate(1000, 600, 1);

      const volumeBottom = regions.volumeArea.y + regions.volumeArea.height;
      const indicatorTop = regions.indicatorPanes[0]!.y;
      expect(indicatorTop).toBeGreaterThanOrEqual(volumeBottom);
    });

    it('should include pane gaps between multiple indicator panes', () => {
      const layout = new LayoutManager(70, 30, 0.2, 0.3, 10);
      const regions = layout.calculate(1000, 600, 2);

      const gap =
        regions.indicatorPanes[1]!.y -
        (regions.indicatorPanes[0]!.y + regions.indicatorPanes[0]!.height);
      expect(gap).toBe(10);
    });
  });

  describe('Indicator price ranges', () => {
    it('should return default range when no price set', () => {
      const layout = new LayoutManager();
      const range = layout.getIndicatorPriceRange('indicator_0');

      expect(range.min).toBe(-1);
      expect(range.max).toBe(1);
    });

    it('should set and get indicator price range', () => {
      const layout = new LayoutManager();
      layout.setIndicatorPriceRange('indicator_0', -5, 5);
      const range = layout.getIndicatorPriceRange('indicator_0');

      expect(range.min).toBeLessThan(-5);
      expect(range.max).toBeGreaterThan(5);
    });

    it('should store independent ranges for different panes', () => {
      const layout = new LayoutManager();
      layout.setIndicatorPriceRange('indicator_0', -10, 10);
      layout.setIndicatorPriceRange('indicator_1', -100, 100);

      const range0 = layout.getIndicatorPriceRange('indicator_0');
      const range1 = layout.getIndicatorPriceRange('indicator_1');

      expect(range0.max - range0.min).toBeLessThan(range1.max - range1.min);
    });
  });

  describe('priceToPixel with paneId', () => {
    it('should use indicator price range when paneId is provided', () => {
      const layout = new LayoutManager();
      layout.setIndicatorPriceRange('indicator_0', 0, 100);

      const pixel = layout.priceToPixel(50, 0, 200, 'indicator_0');
      expect(pixel).toBeGreaterThan(0);
      expect(pixel).toBeLessThan(200);
    });

    it('should use main price range when paneId is not provided', () => {
      const layout = new LayoutManager();
      layout.setPriceRange(0, 100);

      const pixel = layout.priceToPixel(50, 0, 200);
      expect(pixel).toBeGreaterThan(0);
      expect(pixel).toBeLessThan(200);
    });
  });

  describe('Multi-pane routing support', () => {
    it('should allocate N panes when N non-overlay indicators are present', () => {
      const layout = new LayoutManager(70, 30, 0.2, 0.3, 4);
      const regions = layout.calculate(1000, 600, 3);

      expect(regions.indicatorPanes).toHaveLength(3);
      expect(regions.indicatorPanes[0]!.y).toBeLessThan(regions.indicatorPanes[1]!.y);
      expect(regions.indicatorPanes[1]!.y).toBeLessThan(regions.indicatorPanes[2]!.y);
    });

    it('should allocate no panes when indicatorCount is 0 (recalculateLayout removal)', () => {
      const layout = new LayoutManager(70, 30, 0.2, 0.3, 4);
      const regions = layout.calculate(1000, 600, 0);
      expect(regions.indicatorPanes).toHaveLength(0);
    });
  });

  describe('Per-pane independent price ranges', () => {
    it('should compute and store independent ranges for multiple panes', () => {
      const layout = new LayoutManager();
      layout.setIndicatorPriceRange('indicator_0', -5, 15);
      layout.setIndicatorPriceRange('indicator_1', -100, 200);

      const range0 = layout.getIndicatorPriceRange('indicator_0');
      const range1 = layout.getIndicatorPriceRange('indicator_1');

      expect(range0.min).toBeGreaterThan(range1.min);
      expect(range0.max).toBeLessThan(range1.max);
    });

    it('should give each pane equal vertical space share', () => {
      const layout = new LayoutManager(70, 30, 0.2, 0.3, 4);
      const regions = layout.calculate(1000, 600, 2);

      const h0 = regions.indicatorPanes[0]!.height;
      const h1 = regions.indicatorPanes[1]!.height;
      expect(h0).toBeCloseTo(h1, 0);
    });

    it('should maintain separator gaps between adjacent panes', () => {
      const layout = new LayoutManager(70, 30, 0.2, 0.3, 10);
      const regions = layout.calculate(1000, 600, 3);

      const gap01 = regions.indicatorPanes[1]!.y - (regions.indicatorPanes[0]!.y + regions.indicatorPanes[0]!.height);
      const gap12 = regions.indicatorPanes[2]!.y - (regions.indicatorPanes[1]!.y + regions.indicatorPanes[1]!.height);
      expect(gap01).toBe(10);
      expect(gap12).toBe(10);
    });
  });
});
