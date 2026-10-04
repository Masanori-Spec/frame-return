// Keep both language variants so an already-visible notice follows language changes.
export function makeNotice(ja, en, error = false) { return { ja, en, error }; }
export function noticeText(notice, language) { return notice?.[language] ?? ''; }
const reasons = {
  'Frame is missing or renamed': 'フレームが見つからないか、名前が変更されています。',
  'Frame name is duplicated': '同じ名前のフレームが複数あります。',
  'Run or paragraph boundaries changed': '書式ランまたは段落の区切りが変更されています。',
  'Already applied or current text equals this return; prepare a fresh packet': '適用済み、または最新版の文章がこの修正と一致しています。最新版から依頼し直してください。',
  'Current wording differs from the complete baseline': '最新版の文章が、依頼時の文章から変更されています。',
  'A stable, nonempty frame name is required': '空欄ではない、変更されないフレーム名が必要です。',
  'Frame name is not unique': '同じ名前のオブジェクトが複数あります。',
  'Only top-level page frames are supported': 'グループ内などに含まれない通常ページのフレームだけが対象です。',
  'Only ordinary text frames are supported': '通常のテキストフレームだけが対象です。',
  'Linked or unproven-unlinked frames are unsupported': 'リンクされたフレーム、またはリンクなしと確認できないフレームは対象外です。',
  'Master or off-page frames are unsupported': 'マスターページやページ外のフレームは対象外です。',
  'Unsupported story wrapper': 'この文章の格納構造には対応していません。',
  'StoryText requires one leading childless DefaultStyle': '文章の先頭に通常の DefaultStyle が必要です。',
  'More than 256 story elements': '文章の構造要素が上限の256個を超えています。',
  'One final trail element is required': '文章末尾に1つの trail 要素が必要です。',
  'Only ordinary CH text runs are supported': '通常の CH 属性による文章だけが対象です。',
  'Tabs, breaks, soft hyphens, objects and private-use controls are unsupported': 'タブ、改行、ソフトハイフン、埋め込み要素、私用文字は対象外です。',
  'At least one ordinary text run is required': '通常の文章ランが1つ以上必要です。',
  'More than 128 text runs': '文章ランが上限の128個を超えています。',
  'More than 3,000 characters': '文章が上限の3,000文字を超えています。'
};
export function reasonText(reason, language) {
  if (language !== 'ja' || !reason) return reason;
  if (reasons[reason]) return reasons[reason];
  return reason.split('; ').map(part => {
    if (reasons[part]) return reasons[part];
    if (part.startsWith('Unsupported frame flag: ')) return `対象外のフレーム属性: ${part.slice(24)}`;
    if (part.startsWith('Unsupported text construct: ')) return `対象外の文章要素: ${part.slice(28)}`;
    if (/^Nested .+ is unsupported$/.test(part)) return `入れ子の文章要素は対象外です: ${part.slice(7, -15)}`;
    return part;
  }).join(' ');
}
