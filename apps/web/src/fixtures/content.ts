export type ConvId = 'c-design' | 'c-remind' | 'c-tray' | 'new';

export const CONVERSATIONS: {
  id: Exclude<ConvId, 'new'>;
  title: string;
  when: string;
  group: string;
  icon: string;
  excerpt: string;
  ask: string;
  answer: string[];
}[] = [
  {
    id: 'c-design',
    title: '看看我屏幕上的设计稿，信息层级有什么问题',
    when: '13:41',
    group: '今天',
    icon: 'monitor',
    excerpt: 'Core、问候和命令栏的视线还可以再收紧。',
    ask: '看看我屏幕上的设计稿，信息层级有什么问题',
    answer: [
      '这是演示回复，模型还没有接入，不会根据真实画面下结论。',
      '设计稿里的层级是 Core、问候、命令栏。真的接上视觉模型之后，才会分析你当时的屏幕。',
    ],
  },
  {
    id: 'c-remind',
    title: '明早九点提醒我交周报',
    when: '09:12',
    group: '今天',
    icon: 'bell',
    excerpt: '演示提醒。不会写入系统日历。',
    ask: '明早九点提醒我交周报',
    answer: ['这是演示回复。提醒还没有接到系统日历，所以不会在明天九点响。'],
  },
  {
    id: 'c-tray',
    title: '把托盘菜单改成中文',
    when: '周四',
    group: '本周',
    icon: 'messages-square',
    excerpt: '桌面端还没开始做，这里只保留文案。',
    ask: '把托盘菜单改成中文',
    answer: ['这是演示回复。托盘菜单属于以后的桌面端，现在不会改任何文件。'],
  },
];

export const TASKS = [
  {
    id: 't-mail',
    title: '把周报发给设计组长',
    goal: '演示任务。不会打开邮件，也不会发送文件。',
    status: 'wait' as const,
    when: '今天 13:58',
    icon: 'mail',
    steps: [
      { s: 'done', name: '读取周报草稿', d: '演示记录 · 没有读取真实文件' },
      { s: 'wait', name: '等待你确认', d: '确认后也只关闭这条演示，不会发信' },
    ],
  },
  {
    id: 't-archive',
    title: '归档上周的设计稿',
    goal: '演示中的移动。进度是固定的，没有访问 iCloud。',
    status: 'run' as const,
    when: '今天 11:20',
    icon: 'folder',
    progress: 0.4,
    steps: [
      { s: 'done', name: '扫描来源', d: '演示 · 14 个文件' },
      { s: 'active', name: '等待确认移动', d: '不会移动真实文件' },
    ],
  },
  {
    id: 't-minutes',
    title: '转写周五的站会录音',
    goal: '本地转写还没接入。',
    status: 'fail' as const,
    when: '10月30日',
    icon: 'file-audio',
    steps: [{ s: 'fail', name: '本地转写', d: 'Whisper 未接入，所以这条保持失败' }],
  },
  {
    id: 't-downloads',
    title: '整理「下载」文件夹',
    goal: '设计稿里的完成记录。没有访问「下载」。',
    status: 'done' as const,
    when: '11月2日',
    icon: 'folder',
    steps: [{ s: 'done', name: '归位', d: '演示记录，文件仍在原地' }],
  },
];

export const STATUS_LABEL = {
  wait: '待确认',
  run: '进行中',
  fail: '失败',
  done: '已完成',
} as const;

export type MemoryItem = {
  id: string;
  cat: 'pref' | 'profile' | 'learned';
  text: string;
  source: string;
  at: string;
  pinned: boolean;
};

export const MEMORY_CATS = { pref: '偏好', profile: '资料', learned: '最近学到' } as const;

export const MEMORY_SEED: MemoryItem[] = [
  {
    id: 'm-weekly',
    cat: 'pref',
    text: '周报每周一上午交给设计组长',
    source: '演示条目',
    at: '10月20日',
    pinned: true,
  },
  {
    id: 'm-remind',
    cat: 'pref',
    text: '提醒提前 10 分钟，同时语音播报',
    source: '演示条目',
    at: '今天 09:12',
    pinned: true,
  },
  {
    id: 'm-review',
    cat: 'pref',
    text: '设计稿评审时你关注信息层级',
    source: '演示条目',
    at: '今天 13:41',
    pinned: false,
  },
  {
    id: 'm-call',
    cat: 'profile',
    text: '称呼用「你」，不要用昵称',
    source: '演示条目',
    at: '10月12日',
    pinned: false,
  },
  {
    id: 'm-trip',
    cat: 'learned',
    text: '11月10日–12日去杭州出差',
    source: '演示条目',
    at: '11月1日',
    pinned: false,
  },
];

export const SUGGESTIONS: [string, string][] = [
  ['monitor', '总结我屏幕上的内容'],
  ['folder', '整理「下载」文件夹'],
  ['bell', '明天下午三点提醒我和设计团队复盘'],
];
