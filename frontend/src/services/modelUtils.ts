// src/services/modelUtils.ts
import { ImageModel } from './api';
import { apiUtils } from './apiCore';

export const modelUtils = {
  // ตรวจสอบว่าโมเดลรองรับการวิเคราะห์ภาพหรือไม่
  isVisionCapable: (model: ImageModel): boolean => {
    const name = model.name.toLowerCase();
    return (
      model.supportedGenerationMethods.includes('generateContent') &&
      (name.includes('vision') || 
       name.includes('pro') || 
       name.includes('flash') ||
       name.includes('1.5'))
    );
  },

  // จัดเรียงโมเดลตามความเหมาะสม
  sortModelsByRecommendation: (models: ImageModel[]): ImageModel[] => {
    return models.sort((a, b) => {
      // แนะนำก่อน
      if (a.recommended && !b.recommended) return -1;
      if (!a.recommended && b.recommended) return 1;
      
      // Vision models ก่อน
      const aVision = modelUtils.isVisionCapable(a);
      const bVision = modelUtils.isVisionCapable(b);
      if (aVision && !bVision) return -1;
      if (!aVision && bVision) return 1;
      
      // เรียงตามชื่อ
      return a.displayName.localeCompare(b.displayName);
    });
  },

  // กรองโมเดลตามเงื่อนไข
  filterModels: (
    models: ImageModel[], 
    criteria: {
      visionOnly?: boolean;
      minInputTokens?: number;
      maxInputTokens?: number;
      recommendedOnly?: boolean;
      category?: string;
    }
  ): ImageModel[] => {
    return models.filter(model => {
      if (criteria.visionOnly && !modelUtils.isVisionCapable(model)) {
        return false;
      }
      
      if (criteria.minInputTokens && model.inputTokenLimit < criteria.minInputTokens) {
        return false;
      }
      
      if (criteria.maxInputTokens && model.inputTokenLimit > criteria.maxInputTokens) {
        return false;
      }
      
      if (criteria.recommendedOnly && !model.recommended) {
        return false;
      }
      
      if (criteria.category && model.category !== criteria.category) {
        return false;
      }
      
      return true;
    });
  },

  // สร้าง display name ที่เหมาะสม
  getDisplayName: (model: ImageModel): string => {
    return model.displayName || model.name;
  },

  // สร้างคำอธิบายโมเดลแบบสั้น
  getShortDescription: (model: ImageModel, maxLength: number = 100): string => {
    if (!model.description) return 'ไม่มีคำอธิบาย';
    
    if (model.description.length <= maxLength) {
      return model.description;
    }
    
    return model.description.substring(0, maxLength - 3) + '...';
  },

  // ประเมินความเหมาะสมของโมเดลสำหรับงานเฉพาะ
  evaluateModelSuitability: (
    model: ImageModel, 
    task: 'image_analysis' | 'batch_processing' | 'real_time' | 'high_accuracy'
  ): number => {
    let score = 0;
    
    switch (task) {
      case 'image_analysis':
        if (modelUtils.isVisionCapable(model)) score += 50;
        if (model.recommended) score += 20;
        if (model.inputTokenLimit >= 100000) score += 15;
        if (model.outputTokenLimit >= 2000) score += 15;
        break;
        
      case 'batch_processing':
        if (model.inputTokenLimit >= 1000000) score += 40;
        if (model.name.includes('flash')) score += 30; // เร็วกว่า
        if (model.outputTokenLimit >= 4000) score += 20;
        if (modelUtils.isVisionCapable(model)) score += 10;
        break;
        
      case 'real_time':
        if (model.name.includes('flash')) score += 50; // เร็วที่สุด
        if (model.inputTokenLimit >= 10000) score += 25;
        if (modelUtils.isVisionCapable(model)) score += 15;
        if (model.outputTokenLimit >= 1000) score += 10;
        break;
        
      case 'high_accuracy':
        if (model.name.includes('pro')) score += 50; // แม่นยำที่สุด
        if (model.recommended) score += 25;
        if (model.inputTokenLimit >= 1000000) score += 15;
        if (modelUtils.isVisionCapable(model)) score += 10;
        break;
    }
    
    return Math.min(score, 100); // คะแนนสูงสุด 100
  },

  // สร้างข้อเสนอแนะการเลือกโมเดล
  suggestModel: (
    models: ImageModel[], 
    requirements: {
      task: 'image_analysis' | 'batch_processing' | 'real_time' | 'high_accuracy';
      visionRequired?: boolean;
      maxCost?: number;
      minSpeed?: number;
    }
  ): {
    recommended: ImageModel[];
    reasons: string[];
  } => {
    let filteredModels = models;
    const reasons: string[] = [];
    
    // กรองตามความต้องการ vision
    if (requirements.visionRequired) {
      filteredModels = modelUtils.filterModels(filteredModels, { visionOnly: true });
      reasons.push('รองรับการวิเคราะห์ภาพ');
    }
    
    // ประเมินความเหมาะสม
    const scoredModels = filteredModels.map(model => ({
      model,
      score: modelUtils.evaluateModelSuitability(model, requirements.task)
    }));
    
    // เรียงตามคะแนน
    scoredModels.sort((a, b) => b.score - a.score);
    
    // เพิ่มเหตุผล
    switch (requirements.task) {
      case 'image_analysis':
        reasons.push('เหมาะสำหรับการวิเคราะห์ภาพทั่วไป');
        break;
      case 'batch_processing':
        reasons.push('เหมาะสำหรับการประมวลผลจำนวนมาก');
        break;
      case 'real_time':
        reasons.push('ตอบสนองเร็วสำหรับการใช้งานแบบ real-time');
        break;
      case 'high_accuracy':
        reasons.push('ความแม่นยำสูงสำหรับงานที่ต้องการคุณภาพ');
        break;
    }
    
    return {
      recommended: scoredModels.slice(0, 3).map(item => item.model),
      reasons
    };
  },

  // ตรวจสอบความเข้ากันได้ของการตั้งค่า
 validateModelConfig: (model: ImageModel, config: any): {
   valid: boolean;
   errors: string[];
   warnings: string[];
 } => {
   const errors: string[] = [];
   const warnings: string[] = [];

   // ตรวจสอบ temperature
   if (config.temperature !== undefined) {
     if (config.temperature < 0 || config.temperature > 2) {
       errors.push('Temperature ต้องอยู่ระหว่าง 0 ถึง 2');
     }
     if (config.temperature > 1) {
       warnings.push('Temperature สูงอาจทำให้ผลลัพธ์ไม่สม่ำเสมอ');
     }
   }

   // ตรวจสอบ topP
   if (config.topP !== undefined) {
     if (config.topP < 0 || config.topP > 1) {
       errors.push('Top P ต้องอยู่ระหว่าง 0 ถึง 1');
     }
   }

   // ตรวจสอบ topK
   if (config.topK !== undefined) {
     if (config.topK < 1 || config.topK > 100) {
       errors.push('Top K ต้องอยู่ระหว่าง 1 ถึง 100');
     }
   }

   // ตรวจสอบ maxOutputTokens
   if (config.maxOutputTokens !== undefined) {
     if (config.maxOutputTokens > model.outputTokenLimit) {
       errors.push(`Max Output Tokens (${config.maxOutputTokens}) เกินขีดจำกัดของโมเดล (${model.outputTokenLimit})`);
     }
     if (config.maxOutputTokens < 100) {
       warnings.push('Max Output Tokens น้อยอาจทำให้คำตอบไม่สมบูรณ์');
     }
   }

   return {
     valid: errors.length === 0,
     errors,
     warnings
   };
 },

 // คำนวณราคาการใช้งาน (ถ้าระบบมี)
 estimateCost: (
   model: ImageModel, 
   usage: {
     inputTokens: number;
     outputTokens: number;
     imageCount?: number;
   }
 ): {
   inputCost: number;
   outputCost: number;
   imageCost: number;
   totalCost: number;
 } => {
   // ราคาตัวอย่าง (ปรับตามราคาจริง)
   const pricing = {
     'gemini-1.5-pro': { input: 0.00125, output: 0.005, image: 0.0025 },
     'gemini-1.5-flash': { input: 0.000075, output: 0.0003, image: 0.000075 },
     'gemini-pro-vision': { input: 0.00025, output: 0.0005, image: 0.0025 }
   };

   const modelPricing = pricing[model.name as keyof typeof pricing] || pricing['gemini-1.5-pro'];

   const inputCost = (usage.inputTokens / 1000) * modelPricing.input;
   const outputCost = (usage.outputTokens / 1000) * modelPricing.output;
   const imageCost = (usage.imageCount || 0) * modelPricing.image;

   return {
     inputCost,
     outputCost,
     imageCost,
     totalCost: inputCost + outputCost + imageCost
   };
 },

 // แปลงหน่วยเวลา
 formatDuration: (milliseconds: number): string => {
   if (milliseconds < 1000) {
     return `${milliseconds} มิลลิวินาที`;
   } else if (milliseconds < 60000) {
     return `${(milliseconds / 1000).toFixed(1)} วินาที`;
   } else {
     return `${(milliseconds / 60000).toFixed(1)} นาที`;
   }
 },

 // แปลงหน่วย Token
 formatTokenCount: (tokens: number): string => {
   if (tokens < 1000) {
     return `${tokens} tokens`;
   } else if (tokens < 1000000) {
     return `${(tokens / 1000).toFixed(1)}K tokens`;
   } else {
     return `${(tokens / 1000000).toFixed(1)}M tokens`;
   }
 },

 // สร้าง model summary
 createModelSummary: (model: ImageModel): {
   name: string;
   capabilities: string[];
   strengths: string[];
   limitations: string[];
   bestFor: string[];
 } => {
   const capabilities: string[] = [];
   const strengths: string[] = [];
   const limitations: string[] = [];
   const bestFor: string[] = [];

   // Capabilities
   if (modelUtils.isVisionCapable(model)) {
     capabilities.push('วิเคราะห์ภาพ');
   }
   capabilities.push('สร้างข้อความ');
   if (model.inputTokenLimit >= 1000000) {
     capabilities.push('ประมวลผลเอกสารยาว');
   }

   // Strengths & Best for
   if (model.name.includes('pro')) {
     strengths.push('ความแม่นยำสูง');
     strengths.push('การเข้าใจซับซ้อน');
     bestFor.push('งานที่ต้องการคุณภาพสูง');
     bestFor.push('การวิเคราะห์เชิงลึก');
   }

   if (model.name.includes('flash')) {
     strengths.push('ความเร็วสูง');
     strengths.push('ประสิทธิภาพดี');
     bestFor.push('การประมวลผลแบบ Real-time');
     bestFor.push('งานจำนวนมาก');
   }

   if (model.recommended) {
     strengths.push('แนะนำจากระบบ');
     bestFor.push('การใช้งานทั่วไป');
   }

   // Limitations
   if (model.inputTokenLimit < 100000) {
     limitations.push('ข้อมูลอินพุตจำกัด');
   }
   if (model.outputTokenLimit < 2000) {
     limitations.push('ผลลัพธ์อาจสั้น');
   }
   if (!modelUtils.isVisionCapable(model)) {
     limitations.push('ไม่รองรับการวิเคราะห์ภาพ');
   }

   return {
     name: modelUtils.getDisplayName(model),
     capabilities,
     strengths,
     limitations,
     bestFor
   };
 }
};