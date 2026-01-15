/**
 * PreciseDate utility tests.
 * Reference: specs/04-message.md
 */

import { test, expect, describe } from 'bun:test';
import { PreciseDate } from '../../src/utils/precise-date';

describe('PreciseDate', () => {
	test('should extend Date', () => {
		const pd = new PreciseDate();
		expect(pd).toBeInstanceOf(Date);
	});

	test('should store nanoseconds', () => {
		const pd = new PreciseDate(Date.now(), 123456789);
		expect(pd.getNanoseconds()).toBe(123456789);
	});

	test('should create from timestamp in milliseconds', () => {
		const now = Date.now();
		const pd = new PreciseDate(now, 500000000);

		expect(pd.getTime()).toBe(now);
		expect(pd.getNanoseconds()).toBe(500000000);
	});

	test('should create from Date object', () => {
		const date = new Date();
		const pd = new PreciseDate(date, 123456789);

		expect(pd.getTime()).toBe(date.getTime());
		expect(pd.getNanoseconds()).toBe(123456789);
	});

	test('should create from ISO string', () => {
		const isoString = '2024-01-15T12:00:00.000Z';
		const pd = new PreciseDate(isoString, 999999999);

		expect(pd.toISOString()).toBe(isoString);
		expect(pd.getNanoseconds()).toBe(999999999);
	});

	test('should default to 0 nanoseconds', () => {
		const pd = new PreciseDate();
		expect(pd.getNanoseconds()).toBe(0);
	});

	test('should calculate microseconds correctly', () => {
		const now = 1000; // 1 second
		const nanos = 500000; // 0.5 milliseconds = 500 microseconds
		const pd = new PreciseDate(now, nanos);

		// 1000ms * 1000 = 1,000,000 microseconds
		// 500000 nanos / 1000 = 500 microseconds
		// Total: 1,000,500 microseconds
		expect(pd.getMicroseconds()).toBe(1000500);
	});

	test('should generate full time string with nanoseconds', () => {
		const pd = new PreciseDate('2024-01-15T12:00:00.123Z', 456789012);
		const fullTimeString = pd.getFullTimeString();

		// Should include nanoseconds
		expect(fullTimeString).toContain('456789012');
		expect(fullTimeString).toMatch(/2024-01-15T12:00:00\.123456789012Z/);
	});

	test('should pad nanoseconds with leading zeros', () => {
		const pd = new PreciseDate(Date.now(), 123);
		const fullTimeString = pd.getFullTimeString();

		// Should have 9 digits with leading zeros
		expect(fullTimeString).toContain('000000123');
	});

	test('should create from protobuf ITimestamp', () => {
		const timestamp = {
			seconds: 1705320000, // Some timestamp
			nanos: 123456789,
		};

		const pd = PreciseDate.fromTimestamp(timestamp);

		expect(pd.getTime()).toBe(1705320000 * 1000);
		expect(pd.getNanoseconds()).toBe(123456789);
	});

	test('should handle string seconds in ITimestamp', () => {
		const timestamp = {
			seconds: '1705320000',
			nanos: 987654321,
		};

		const pd = PreciseDate.fromTimestamp(timestamp);

		expect(pd.getTime()).toBe(1705320000 * 1000);
		expect(pd.getNanoseconds()).toBe(987654321);
	});

	test('should handle null values in ITimestamp', () => {
		const timestamp = {
			seconds: null,
			nanos: null,
		};

		const pd = PreciseDate.fromTimestamp(timestamp);

		expect(pd.getTime()).toBeGreaterThan(0); // Should create valid date
		expect(pd.getNanoseconds()).toBe(0);
	});

	test('should handle undefined values in ITimestamp', () => {
		const timestamp = {};

		const pd = PreciseDate.fromTimestamp(timestamp);

		expect(pd.getNanoseconds()).toBe(0);
	});

	test('should be usable as regular Date', () => {
		const pd = new PreciseDate('2024-01-15T12:00:00.000Z');

		// Should work with Date methods
		expect(pd.getFullYear()).toBe(2024);
		expect(pd.getMonth()).toBe(0); // January
		expect(pd.getDate()).toBe(15);
		expect(pd.toISOString()).toBe('2024-01-15T12:00:00.000Z');
	});
});
