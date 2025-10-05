export interface PageMeta {
  id: string;
  title: string;
  description?: string;
  icon: string;
  badge?: string;
}

const defaultMeta: PageMeta = {
  id: 'default',
  title: 'หน้าจัดการ',
  description: 'ระบบบริหารจัดการ',
  icon: 'fa-layer-group'
};

export const pageMeta: Record<string, PageMeta> = {
  dashboard: {
    id: 'dashboard',
    title: 'แดชบอร์ดสรุปภาพรวม',
    description: 'สรุปสถานะระบบ การขาย และกิจกรรมล่าสุด',
    icon: 'fa-gauge-high'
  },
  chat: {
    id: 'chat',
    title: 'ศูนย์แชทลูกค้า',
    description: 'ติดตามบทสนทนาและสถานะ AI แบบเรียลไทม์',
    icon: 'fa-comments'
  },
  'chat-test': {
    id: 'chat-test',
    title: 'Chat Playground',
    description: 'ทดสอบบทสนทนากับ AI ก่อนปล่อยใช้งานจริง',
    icon: 'fa-flask-vial'
  },
  keywords: {
    id: 'keywords',
    title: 'จัดการ Keyword & Media',
    description: 'ผูกคำค้นหากับรูปภาพและข้อความแนะนำ',
    icon: 'fa-tags'
  },
  products: {
    id: 'products',
    title: 'คลังสินค้า & สินค้า',
    description: 'บริหารสินค้าพร้อมข้อมูลประกอบ',
    icon: 'fa-box-open'
  },
  'image-config': {
    id: 'image-config',
    title: 'ตั้งค่าภาพสินค้า',
    description: 'กำหนดรูปแบบ รูปภาพ และ Asset ในระบบ',
    icon: 'fa-images'
  },
  'model-config': {
    id: 'model-config',
    title: 'จัดการโมเดล',
    description: 'ปรับแต่งโมเดลการทำงานขั้นสูง',
    icon: 'fa-sliders'
  },
  documents: {
    id: 'documents',
    title: 'คลังเอกสาร',
    description: 'จัดการเอกสารและไฟล์อ้างอิง',
    icon: 'fa-file-alt'
  },
  'vector-db': {
    id: 'vector-db',
    title: 'Vector Database',
    description: 'ตรวจสอบ Embedding และข้อมูลเชิงลึก',
    icon: 'fa-database'
  },
  'context-window': {
    id: 'context-window',
    title: 'Context Window Monitor',
    description: 'วิเคราะห์ปริมาณข้อความที่ AI ใช้งาน',
    icon: 'fa-window-maximize'
  }
};

export const getPageMeta = (id: string): PageMeta => {
  return pageMeta[id] ?? defaultMeta;
};
