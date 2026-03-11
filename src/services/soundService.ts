const SOUNDS = {
  SEND: 'https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3',
  COPY: 'https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3',
  EAT: 'https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3',
  GAMEOVER: 'https://assets.mixkit.co/active_storage/sfx/2018/2018-preview.mp3',
  MOVE: 'https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3',
  WIN: 'https://assets.mixkit.co/active_storage/sfx/2020/2020-preview.mp3',
  CLICK: 'https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3',
  FLAP: 'https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3',
  SCORE: 'https://assets.mixkit.co/active_storage/sfx/2020/2020-preview.mp3',
  DIE: 'https://assets.mixkit.co/active_storage/sfx/2018/2018-preview.mp3',
};

class SoundService {
  private audios: Map<string, HTMLAudioElement> = new Map();

  constructor() {
    Object.entries(SOUNDS).forEach(([key, url]) => {
      const audio = new Audio(url);
      audio.preload = 'auto';
      this.audios.set(key, audio);
    });
  }

  play(soundName: keyof typeof SOUNDS) {
    const audio = this.audios.get(soundName);
    if (audio) {
      audio.currentTime = 0;
      audio.play().catch(e => console.log('Audio play blocked:', e));
    }
  }
}

export const soundService = new SoundService();
