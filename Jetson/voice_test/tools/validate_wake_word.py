#!/usr/bin/env python3
"""
WAKE Word Quality Validator
- STT로 오디오 파일 내용 확인
- LLM으로 "싸비스" 여부 판별
- 잘못된 파일 자동 분류 및 이동
"""
from __future__ import annotations

import os
import json
import shutil
import argparse
from pathlib import Path
from typing import List, Dict, Tuple, Optional, Any
from dataclasses import dataclass
from concurrent.futures import ThreadPoolExecutor, as_completed

import numpy as np
import soundfile as sf
import httpx


# =====================
# Configuration
# =====================
@dataclass
class ValidatorConfig:
    # Server endpoints (기존 시스템 활용)
    stt_url: str = "http://13.124.184.2:8000/stt"
    llm_verify_url: str = "http://13.124.184.2:8000/verify_wake"
    
    # Jetson token (기존 config.py와 동일)
    jetson_token: str = "j12n3kj2b13kj1b"
    
    # Validation thresholds
    confidence_threshold: float = 0.7  # LLM 신뢰도
    
    # Target wake words (정규화된 형태)
    target_words: List[str] = None
    
    # Concurrency
    max_workers: int = 4
    
    # Timeouts
    stt_timeout: float = 10.0
    llm_timeout: float = 5.0
    
    def __post_init__(self):
        if self.target_words is None:
            self.target_words = [
                "싸비스",
                "사비스",
                "써비스",
                "서비스",  # 유사 발음 허용
            ]


# =====================
# STT Client
# =====================
class STTClient:
    """기존 프록시 서버 활용 STT"""
    
    def __init__(self, cfg: ValidatorConfig):
        self.cfg = cfg
        self.client = httpx.Client(timeout=httpx.Timeout(cfg.stt_timeout))
    
    def transcribe(self, audio_path: Path) -> Tuple[str, float]:
        """
        음성 파일을 텍스트로 변환
        
        Returns:
            (text, confidence)
        """
        try:
            with open(audio_path, "rb") as f:
                files = {"file": (audio_path.name, f, "audio/wav")}
                data = {"language": "ko"}
                headers = {"x-token": self.cfg.jetson_token}
                
                r = self.client.post(
                    self.cfg.stt_url,
                    data=data,
                    files=files,
                    headers=headers,
                )
                r.raise_for_status()
                
                result = r.json()
                text = result.get("text", "").strip()
                
                # confidence는 서버가 제공하면 사용, 없으면 1.0
                confidence = float(result.get("confidence", 1.0))
                
                return text, confidence
        
        except Exception as e:
            print(f"⚠️  STT failed for {audio_path.name}: {e}")
            return "", 0.0
    
    def close(self):
        self.client.close()


# =====================
# LLM Verifier
# =====================
class LLMVerifier:
    """LLM 기반 wake word 검증"""
    
    def __init__(self, cfg: ValidatorConfig):
        self.cfg = cfg
        self.client = httpx.Client(timeout=httpx.Timeout(cfg.llm_timeout))
    
    def verify(self, text: str) -> Tuple[bool, float, str]:
        """
        텍스트가 wake word인지 LLM으로 검증
        
        Returns:
            (is_valid, confidence, reason)
        """
        if not text:
            return False, 0.0, "empty_text"
        
        try:
            payload = {
                "text": text,
                "target_words": self.cfg.target_words,
            }
            headers = {"x-token": self.cfg.jetson_token}
            
            r = self.client.post(
                self.cfg.llm_verify_url,
                json=payload,
                headers=headers,
            )
            r.raise_for_status()
            
            result = r.json()
            
            is_valid = bool(result.get("is_valid", False))
            confidence = float(result.get("confidence", 0.0))
            reason = str(result.get("reason", "unknown"))
            
            return is_valid, confidence, reason
        
        except httpx.HTTPStatusError as e:
            # 서버가 없으면 fallback: 간단한 텍스트 매칭
            print(f"⚠️  LLM server unavailable, using fallback matching")
            return self._fallback_verify(text)
        
        except Exception as e:
            print(f"⚠️  LLM verify failed: {e}")
            return False, 0.0, f"error: {e}"
    
    def _fallback_verify(self, text: str) -> Tuple[bool, float, str]:
        """LLM 없이 간단한 텍스트 매칭"""
        text_norm = self._normalize_korean(text)
        
        for target in self.cfg.target_words:
            target_norm = self._normalize_korean(target)
            if target_norm in text_norm:
                return True, 0.8, f"matched: {target}"
        
        return False, 0.2, "no_match"
    
    def _normalize_korean(self, text: str) -> str:
        """한글 정규화"""
        text = text.lower().strip()
        
        # 공백, 특수문자 제거
        for ch in [" ", ".", ",", "!", "?", "~", "-", "_"]:
            text = text.replace(ch, "")
        
        return text
    
    def close(self):
        self.client.close()


# =====================
# File Validator
# =====================
@dataclass
class ValidationResult:
    """검증 결과"""
    path: Path
    is_valid: bool
    stt_text: str
    stt_confidence: float
    llm_confidence: float
    reason: str
    action: str  # "keep" | "move" | "delete"


class WakeWordValidator:
    """WAKE word 파일 검증기"""
    
    def __init__(self, cfg: ValidatorConfig):
        self.cfg = cfg
        self.stt = STTClient(cfg)
        self.llm = LLMVerifier(cfg)
    
    def validate_file(self, audio_path: Path) -> ValidationResult:
        """단일 파일 검증"""
        # 1) STT 변환
        stt_text, stt_conf = self.stt.transcribe(audio_path)
        
        if not stt_text:
            return ValidationResult(
                path=audio_path,
                is_valid=False,
                stt_text="",
                stt_confidence=0.0,
                llm_confidence=0.0,
                reason="stt_failed",
                action="move",
            )
        
        # 2) LLM 검증
        is_valid, llm_conf, reason = self.llm.verify(stt_text)
        
        # 3) 판정
        if is_valid and llm_conf >= self.cfg.confidence_threshold:
            action = "keep"
        else:
            action = "move"
        
        return ValidationResult(
            path=audio_path,
            is_valid=is_valid,
            stt_text=stt_text,
            stt_confidence=stt_conf,
            llm_confidence=llm_conf,
            reason=reason,
            action=action,
        )
    
    def validate_directory(
        self,
        input_dir: Path,
        output_report: Optional[Path] = None,
    ) -> List[ValidationResult]:
        """디렉토리 내 모든 wav 파일 검증"""
        wav_files = sorted(input_dir.glob("*.wav"))
        
        if not wav_files:
            print(f"⚠️  No wav files found in {input_dir}")
            return []
        
        print(f"\n{'='*60}")
        print(f"🔍 Validating {len(wav_files)} files in {input_dir}")
        print(f"{'='*60}\n")
        
        results = []
        
        with ThreadPoolExecutor(max_workers=self.cfg.max_workers) as executor:
            futures = {
                executor.submit(self.validate_file, wav): wav
                for wav in wav_files
            }
            
            for i, future in enumerate(as_completed(futures), 1):
                wav = futures[future]
                
                try:
                    result = future.result()
                    results.append(result)
                    
                    # 진행 상황 출력
                    status = "✅" if result.is_valid else "❌"
                    print(f"[{i:04d}/{len(wav_files)}] {status} {wav.name}")
                    print(f"  STT: '{result.stt_text}' (conf={result.stt_confidence:.2f})")
                    print(f"  LLM: {result.reason} (conf={result.llm_confidence:.2f})")
                    print(f"  Action: {result.action}")
                    
                except Exception as e:
                    print(f"❌ Error processing {wav.name}: {e}")
        
        # 결과 요약
        self._print_summary(results)
        
        # 리포트 저장
        if output_report:
            self._save_report(results, output_report)
        
        return results
    
    def _print_summary(self, results: List[ValidationResult]):
        """결과 요약 출력"""
        total = len(results)
        valid = sum(1 for r in results if r.is_valid)
        invalid = total - valid
        
        print(f"\n{'='*60}")
        print(f"📊 Validation Summary")
        print(f"{'='*60}")
        print(f"Total:   {total}")
        print(f"Valid:   {valid} ({valid/max(1,total)*100:.1f}%)")
        print(f"Invalid: {invalid} ({invalid/max(1,total)*100:.1f}%)")
        print(f"{'='*60}\n")
    
    def _save_report(self, results: List[ValidationResult], output_path: Path):
        """검증 리포트 저장"""
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        report = {
            "total": len(results),
            "valid": sum(1 for r in results if r.is_valid),
            "invalid": sum(1 for r in results if not r.is_valid),
            "results": [
                {
                    "file": str(r.path.name),
                    "is_valid": r.is_valid,
                    "stt_text": r.stt_text,
                    "stt_confidence": r.stt_confidence,
                    "llm_confidence": r.llm_confidence,
                    "reason": r.reason,
                    "action": r.action,
                }
                for r in results
            ],
        }
        
        output_path.write_text(
            json.dumps(report, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
        
        print(f"📄 Report saved: {output_path}")
    
    def close(self):
        self.stt.close()
        self.llm.close()


# =====================
# File Organizer
# =====================
class FileOrganizer:
    """검증 결과에 따라 파일 정리"""
    
    def __init__(self, dry_run: bool = False):
        self.dry_run = dry_run
    
    def organize(
        self,
        results: List[ValidationResult],
        invalid_dir: Path,
        backup_dir: Optional[Path] = None,
    ):
        """검증 결과에 따라 파일 이동"""
        # 디렉토리 생성
        invalid_dir.mkdir(parents=True, exist_ok=True)
        
        if backup_dir:
            backup_dir.mkdir(parents=True, exist_ok=True)
        
        moved = 0
        
        for result in results:
            if result.action != "move":
                continue
            
            src = result.path
            
            # invalid 디렉토리로 이동
            dst = invalid_dir / src.name
            
            # 중복 처리
            if dst.exists():
                counter = 1
                while dst.exists():
                    dst = invalid_dir / f"{src.stem}_dup{counter}{src.suffix}"
                    counter += 1
            
            if self.dry_run:
                print(f"[DRY-RUN] Would move: {src.name} -> {dst}")
            else:
                # 백업
                if backup_dir:
                    backup_dst = backup_dir / src.name
                    if backup_dst.exists():
                        counter = 1
                        while backup_dst.exists():
                            backup_dst = backup_dir / f"{src.stem}_dup{counter}{src.suffix}"
                            counter += 1
                    shutil.copy2(src, backup_dst)
                
                # 이동
                shutil.move(str(src), str(dst))
                moved += 1
                print(f"📦 Moved: {src.name} -> invalid/")
        
        print(f"\n{'='*60}")
        if self.dry_run:
            print(f"[DRY-RUN] Would move {moved} files")
        else:
            print(f"✅ Moved {moved} invalid files")
        print(f"{'='*60}\n")


# =====================
# Interactive Review
# =====================
class InteractiveReviewer:
    """수동 검토 도구"""
    
    def review(self, results: List[ValidationResult]):
        """의심스러운 파일 수동 검토"""
        # 낮은 신뢰도 파일 필터링
        suspicious = [
            r for r in results
            if 0.3 < r.llm_confidence < 0.7  # 애매한 것들만
        ]
        
        if not suspicious:
            print("✅ No suspicious files to review")
            return
        
        print(f"\n{'='*60}")
        print(f"🔍 Interactive Review: {len(suspicious)} suspicious files")
        print(f"{'='*60}\n")
        
        for i, result in enumerate(suspicious, 1):
            print(f"\n[{i}/{len(suspicious)}] {result.path.name}")
            print(f"  STT: '{result.stt_text}'")
            print(f"  LLM confidence: {result.llm_confidence:.2f}")
            print(f"  Reason: {result.reason}")
            
            # 오디오 재생 (선택)
            # self._play_audio(result.path)
            
            while True:
                answer = input("  Keep this file? (y/n/skip): ").strip().lower()
                if answer in ["y", "n", "s", "skip"]:
                    break
            
            if answer == "y":
                result.action = "keep"
                result.is_valid = True
                print("  ✅ Marked as VALID")
            elif answer == "n":
                result.action = "move"
                result.is_valid = False
                print("  ❌ Marked as INVALID")
            else:
                print("  ⏭️  Skipped")


# =====================
# CLI
# =====================
def main():
    parser = argparse.ArgumentParser(description="WAKE word validator")
    
    # Commands
    subparsers = parser.add_subparsers(dest="command", help="Command")
    
    # --- validate ---
    validate_parser = subparsers.add_parser("validate", help="Validate files")
    validate_parser.add_argument("--input", required=True, help="Input directory")
    validate_parser.add_argument("--report", default=None, help="Output report path")
    validate_parser.add_argument("--target-words", nargs="*", default=None)
    validate_parser.add_argument("--confidence", type=float, default=0.7)
    validate_parser.add_argument("--workers", type=int, default=4)
    
    # --- organize ---
    organize_parser = subparsers.add_parser("organize", help="Organize files by validation")
    organize_parser.add_argument("--input", required=True)
    organize_parser.add_argument("--invalid-dir", default="invalid")
    organize_parser.add_argument("--backup-dir", default=None)
    organize_parser.add_argument("--dry-run", action="store_true")
    organize_parser.add_argument("--confidence", type=float, default=0.7)
    
    # --- full ---
    full_parser = subparsers.add_parser("full", help="Validate + Organize")
    full_parser.add_argument("--input", required=True)
    full_parser.add_argument("--invalid-dir", default="invalid")
    full_parser.add_argument("--backup-dir", default="backup")
    full_parser.add_argument("--report", default="validation_report.json")
    full_parser.add_argument("--dry-run", action="store_true")
    full_parser.add_argument("--interactive", action="store_true")
    full_parser.add_argument("--confidence", type=float, default=0.7)
    
    args = parser.parse_args()
    
    if args.command is None:
        parser.print_help()
        return
    
    # Config
    cfg = ValidatorConfig(
        confidence_threshold=args.confidence,
        max_workers=getattr(args, "workers", 4),
    )
    
    if hasattr(args, "target_words") and args.target_words:
        cfg.target_words = args.target_words
    
    # Execute
    if args.command == "validate":
        validator = WakeWordValidator(cfg)
        try:
            results = validator.validate_directory(
                Path(args.input),
                Path(args.report) if args.report else None,
            )
        finally:
            validator.close()
    
    elif args.command == "organize":
        validator = WakeWordValidator(cfg)
        try:
            results = validator.validate_directory(Path(args.input))
            
            organizer = FileOrganizer(dry_run=args.dry_run)
            organizer.organize(
                results,
                invalid_dir=Path(args.invalid_dir),
                backup_dir=Path(args.backup_dir) if args.backup_dir else None,
            )
        finally:
            validator.close()
    
    elif args.command == "full":
        validator = WakeWordValidator(cfg)
        try:
            # 1) Validate
            results = validator.validate_directory(
                Path(args.input),
                Path(args.report) if args.report else None,
            )
            
            # 2) Interactive review
            if args.interactive:
                reviewer = InteractiveReviewer()
                reviewer.review(results)
            
            # 3) Organize
            organizer = FileOrganizer(dry_run=args.dry_run)
            organizer.organize(
                results,
                invalid_dir=Path(args.invalid_dir),
                backup_dir=Path(args.backup_dir) if args.backup_dir else None,
            )
        
        finally:
            validator.close()


if __name__ == "__main__":
    main()