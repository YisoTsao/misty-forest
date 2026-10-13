// 攝影機避讓不理會的碰撞體 handle（矮欄杆等）。EnvironmentColliders 建立 / 移除時維護，FollowCamera 的 shape cast 讀取。
export const cameraIgnoredColliders = new Set<number>();
