// 재고 1단계(SQL 196, Min 2026-11-26 「재고 관리를 모두 수기 입력 할 순 없으니까」) — 바코드 정규화 · 엑셀 일괄 등록 읽기 · 스캔 찾기
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const C = require('../ops/assets/saizen-core.js');

test('invCodeNorm — 공백·전각·소문자 정리, 숫자 셀(엑셀)도 문자열로, 빈 값은 빈 문자열', () => {
  assert.equal(C.invCodeNorm(' 4901234 567894 '), '4901234567894');
  assert.equal(C.invCodeNorm('４９０１２３４５６７８９４'), '4901234567894');
  assert.equal(C.invCodeNorm('ab-12'), 'AB-12');
  assert.equal(C.invCodeNorm(4901234567894), '4901234567894');
  assert.equal(C.invCodeNorm(null), ''); assert.equal(C.invCodeNorm(''), '');
});

test('invNumText — 숫자 칸: 전각·쉼표 정리, 빈칸은 빈 문자열, 숫자가 아니면 null(그 줄 오류)', () => {
  assert.equal(C.invNumText('1,200'), '1200');
  assert.equal(C.invNumText('１２'), '12');
  assert.equal(C.invNumText(3.5), '3.5');
  assert.equal(C.invNumText(''), ''); assert.equal(C.invNumText(null), '');
  assert.equal(C.invNumText('12個'), null);
  assert.equal(C.invNumText('-3'), null);           // 음수는 받지 않는다
});

test('invImportRows — 머리글(일·한·영 아무거나)로 칸을 찾고, 머리글 줄 위의 제목 줄은 건너뛴다', () => {
  const aoa = [
    ['ゴルフショップ在庫一覧'],
    ['品名', '区分', '単位', 'JAN(バラ)', 'JAN(箱)', '箱入数', '単価', '仕入先', '初期在庫', 'メモ'],
    ['ゴルフボール', 'ゴルフボール', '箱', 4901234567894, '14901234567891', '12', '3,000', '山田商事', '24', 'x'],
    ['', '', '', '', '', '', '', '', '', ''],                                   // 빈 줄은 버린다
    ['グローブ', '', '', ' 4900000000011 ', '', '', 'abc', '', '', '']];
  const r = C.invImportRows(aoa);
  assert.equal(r.headerRow, 1);
  assert.deepEqual(r.unknown, ['メモ']);
  assert.equal(r.rows.length, 2);
  assert.deepEqual(r.rows[0], { line: 3, name: 'ゴルフボール', category: 'ゴルフボール', unit: '箱', barcode: '4901234567894', case_barcode: '14901234567891', case_qty: '12', cost: '3000', supplier: '山田商事', qty: '24' });
  assert.equal(r.rows[1].barcode, '4900000000011');
  assert.equal(r.rows[1].cost, null);                                            // 숫자 아님 → null(미리보기에서 오류)
  const ko = C.invImportRows([['품목명', '바코드', '박스 바코드', '박스 입수', '적정재고', '보관 위치']]);
  assert.deepEqual(ko.map, { name: 0, barcode: 1, case_barcode: 2, case_qty: 3, par: 4, location: 5 });
  const en = C.invImportRows([['Item', 'Barcode', 'Case barcode', 'Case qty', 'Unit cost', 'Stock']]);
  assert.deepEqual(en.map, { name: 0, barcode: 1, case_barcode: 2, case_qty: 3, cost: 4, qty: 5 });
  assert.equal(C.invImportRows([['a', 'b'], [1, 2]]).headerRow, -1);              // 품목명 머리글이 없으면 못 읽는다
});

test('invImportCheck — 미리보기: 새로·갱신·오류(이름 없음·숫자·박스 입수·파일 안 겹침) — 서버 inv_import 와 같은 규칙', () => {
  const items = [{ id: 'a', name_ko: 'ゴルフボール', barcode: '4901234567894', case_barcode: null }, { id: 'b', name_ko: 'ティー', barcode: null, case_barcode: null }];
  const rows = [
    { line: 2, name: 'ゴルフボール(新)', barcode: '4901234567894' },          // 바코드로 기존 → 갱신
    { line: 3, name: 'ティー' },                                                // 이름으로 기존 → 갱신
    { line: 4, name: 'グローブ', barcode: '4900000000011', qty: '5' },         // 새로
    { line: 5, name: '', barcode: '4900000000099' },                            // 새로인데 이름 없음
    { line: 6, name: '重複', barcode: '4900000000011' },                        // 파일 안 겹침
    { line: 7, name: '箱', case_barcode: '149' },                               // 박스 입수 없음
    { line: 8, name: '数字', cost: null }];                                     // 숫자 아님
  const c = C.invImportCheck(items, rows);
  assert.equal(c.add, 1); assert.equal(c.update, 2);
  assert.deepEqual(c.errors.map(e => [e.line, e.code]), [[5, 'noName'], [6, 'dupInFile'], [7, 'caseQty'], [8, 'badNum']]);
  assert.deepEqual(c.ok.map(r => r.line), [2, 3, 4]);                          // 보낼 줄(오류 줄은 빼고 보낸다)
});

test('invScanFind — 낱개 바코드 = 1, 박스 바코드 = 입수만큼, 없으면 null', () => {
  const items = [{ id: 'a', barcode: '4901234567894', case_barcode: '14901234567891', case_qty: 12 }, { id: 'b', barcode: 'AB-12' }];
  assert.deepEqual(C.invScanFind(items, '4901234567894'), { item: items[0], mult: 1, isCase: false });
  assert.deepEqual(C.invScanFind(items, ' 14901234567891\n'), { item: items[0], mult: 12, isCase: true });
  assert.deepEqual(C.invScanFind(items, 'ab-12'), { item: items[1], mult: 1, isCase: false });
  assert.equal(C.invScanFind(items, '000'), null);
  assert.equal(C.invScanFind(items, ''), null);
});
