import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export const Logger = {
  isHTTP: false,
  log: (...args: any[]) => {
    if (Logger.isHTTP) {
      console.log("[INFO]", ...args);
    } else {
      console.error("[INFO]", ...args);
    }
  },
  error: (...args: any[]) => {
    console.error("[ERROR]", ...args);
  },
};

/**
 * 获取工具目录的绝对路径
 * 基于当前文件位置（utils/logger.ts）计算工具根目录（tools/figma/）
 */
function getToolDir(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  // 从 utils/logger.ts 返回到 tools/figma/
  return path.resolve(__dirname, "..");
}

/**
 * 写入日志到工具相对目录下的 logs 目录
 * @param name - 日志文件名
 * @param value - 要写入的数据
 */
export function writeFigmaLogs(name: string, value: any): void {
  try {
    const toolDir = getToolDir();
    const logsDir = path.join(toolDir, "logs");
    
    // 生成时间戳前缀：年-月-日-小时-分钟
    const now = new Date();
    const timestamp = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
      String(now.getHours()).padStart(2, "0"),
      String(now.getMinutes()).padStart(2, "0"),
    ].join("-");

    // 如果文件名已经包含时间戳前缀，则不重复添加
    const timestampPattern = /^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}/;
    const logFileName = timestampPattern.test(name) ? name : `${timestamp}_${name}`;
    
    const logPath = path.join(logsDir, logFileName);

    // Create logs directory if it doesn't exist
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    fs.writeFileSync(logPath, JSON.stringify(value, null, 2));
    Logger.log(`Figma log written to: ${logPath}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    Logger.error(`Failed to write Figma logs to ${name}: ${errorMessage}`);
  }
}

export function writeLogs(name: string, value: any): void {
  if (process.env.NODE_ENV !== "development") return;

  try {
    const logsDir = "logs";
    const logPath = `${logsDir}/${name}`;

    // Check if we can write to the current directory
    fs.accessSync(process.cwd(), fs.constants.W_OK);

    // Create logs directory if it doesn't exist
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    fs.writeFileSync(logPath, JSON.stringify(value, null, 2));
    Logger.log(`Debug log written to: ${logPath}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    Logger.log(`Failed to write logs to ${name}: ${errorMessage}`);
  }
}
