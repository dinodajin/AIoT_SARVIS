# pipeline/state_machine.py
import time
from dataclasses import dataclass
from enum import Enum, auto

class Mode(Enum):
    IDLE = auto()
    ACTIVE = auto()
    FOLLOW = auto()

@dataclass
class StateConfig:
    active_timeout_sec: float = 6.0
    command_cooldown_sec: float = 0.8
    speaker_cache_sec: float = 8.0

class StateMachine:
    def __init__(self, cfg: StateConfig):
        self.cfg = cfg
        self.mode = Mode.IDLE
        self._active_deadline = 0.0
        self._last_cmd_time = 0.0
        self._cached_speaker_id = None
        self._speaker_cache_until = 0.0

    def tick(self):
        now = time.time()
        if self.mode == Mode.ACTIVE and now > self._active_deadline:
            self.mode = Mode.IDLE

    def enter_active(self):
        self.mode = Mode.ACTIVE
        self._active_deadline = time.time() + self.cfg.active_timeout_sec

    def refresh_active(self):
        if self.mode == Mode.ACTIVE:
            self._active_deadline = time.time() + self.cfg.active_timeout_sec

    def enter_follow(self):
        self.mode = Mode.FOLLOW

    def exit_follow_to_active(self):
        self.mode = Mode.ACTIVE
        self._active_deadline = time.time() + self.cfg.active_timeout_sec

    def can_execute(self):
        return (time.time() - self._last_cmd_time) >= self.cfg.command_cooldown_sec

    def mark_executed(self):
        self._last_cmd_time = time.time()

    def get_cached_speaker(self):
        if time.time() <= self._speaker_cache_until:
            return self._cached_speaker_id
        return None

    def set_cached_speaker(self, sid: str):
        self._cached_speaker_id = sid
        self._speaker_cache_until = time.time() + self.cfg.speaker_cache_sec
