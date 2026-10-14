// 水道的畫面狀態（任務 8C）：Waterway 元件每幀寫入，除錯 API 與測試讀取（水面推進到哪裡、哪道木槽有水、分水盆的角度）。
export const waterwayRuntime = {
  /** 渠道水面從泉眼起算推進到的距離（公尺） */
  channelReach: 0,
  /** 每道木槽的水推進到的距離（公尺） */
  flumeReach: [] as number[],
  /** 汲水輪的轉角（弧度，有水時持續增加） */
  rotorAngle: 0,
  /** 分水盆相對骨架的角度（弧度） */
  spoutYaw: 0,
};
