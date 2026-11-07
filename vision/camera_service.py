"""OpenCV Computer Vision Service for Optical Level & Pump LED Detection.

Features:
1. Tank ROI calibration via perspective transform over 4 bounding corners.
2. HSV color segmentation isolating dyed water from background reflections.
3. 5x5 median filtering and morphological operations for glare removal.
4. Optical fill fraction calculation: Height(dyed water) / Height(calibrated tank).
5. Pump indicator LED detection over ROI (brightness/hue threshold).
6. Graceful degradation: returns "VISION_OFFLINE" when webcam is unavailable, never substitutes zero.
"""
import logging
from typing import Dict, List, Optional, Tuple, Any
import cv2
import numpy as np
from pydantic import BaseModel

logger = logging.getLogger("vision_service")

class CalibrationCorners(BaseModel):
    top_left: Tuple[int, int] = (50, 50)
    top_right: Tuple[int, int] = (450, 50)
    bottom_right: Tuple[int, int] = (450, 450)
    bottom_left: Tuple[int, int] = (50, 450)

class VisionMeasurementResult(BaseModel):
    status: str  # "ONLINE", "VISION_OFFLINE", "CALIBRATING"
    optical_fill_fraction: Optional[float]
    estimated_level_bbl: Optional[float]
    pump_led_illuminated: bool
    pump_state_detected: str  # "RUNNING", "STOPPED", "UNKNOWN"
    confidence: str
    contour_area_pixels: int
    raw_frame_height: int
    raw_frame_width: int
    timestamp: str

class OpenCVVisionService:
    """Optical measurement service detecting fluid levels and equipment state."""

    def __init__(self, camera_index: int = 0, enabled: bool = False):
        self.camera_index = camera_index
        self.enabled = enabled
        self._cap = None
        self._is_open = False

        # Calibrated tank ROI corners
        self.corners = CalibrationCorners()

        # HSV segmentation thresholds for blue/cyan/green dyed water
        # In Permian/EOG demo rigs, blue dye (e.g. food coloring) isolates water cleanly
        self.hsv_lower = np.array([85, 50, 50], dtype=np.uint8)   # Blue/Cyan lower bound
        self.hsv_upper = np.array([135, 255, 255], dtype=np.uint8) # Blue/Cyan upper bound

        # LED ROI (normalized coordinates on tank edge)
        self.led_roi = (420, 70, 445, 95)  # (x1, y1, x2, y2)

    def initialize_camera(self) -> bool:
        """Attempt to open hardware webcam."""
        if not self.enabled:
            logger.info("Vision service disabled in config. Camera marked offline.")
            self._is_open = False
            return False

        try:
            self._cap = cv2.VideoCapture(self.camera_index)
            if self._cap.isOpened():
                self._is_open = True
                logger.info(f"OpenCV successfully connected to webcam {self.camera_index}.")
                return True
            else:
                self._is_open = False
                logger.warning(f"Webcam index {self.camera_index} could not be opened.")
                return False
        except Exception as e:
            self._is_open = False
            logger.warning(f"Error opening camera: {e}")
            return False

    def release(self):
        """Release camera resource."""
        if self._cap:
            try:
                self._cap.release()
            except Exception:
                pass
        self._is_open = False

    def calibrate_corners(self, top_left: Tuple[int, int], top_right: Tuple[int, int], bottom_right: Tuple[int, int], bottom_left: Tuple[int, int]) -> CalibrationCorners:
        """Calibrate the 4 perspective corners of the clear tank."""
        self.corners = CalibrationCorners(
            top_left=top_left,
            top_right=top_right,
            bottom_right=bottom_right,
            bottom_left=bottom_left,
        )
        return self.corners

    def process_frame(self, frame: Optional[np.ndarray] = None) -> VisionMeasurementResult:
        """Process an optical image frame and extract fluid fill fraction and pump LED status."""
        from datetime import datetime, timezone

        now_iso = datetime.now(timezone.utc).isoformat()

        if frame is None:
            if not self._is_open or self._cap is None:
                # Hardware camera unavailable: return explicit VISION_OFFLINE
                return VisionMeasurementResult(
                    status="VISION_OFFLINE",
                    optical_fill_fraction=None,
                    estimated_level_bbl=None,
                    pump_led_illuminated=False,
                    pump_state_detected="UNKNOWN",
                    confidence="LOW",
                    contour_area_pixels=0,
                    raw_frame_height=0,
                    raw_frame_width=0,
                    timestamp=now_iso,
                )
            ret, frame = self._cap.read()
            if not ret or frame is None:
                return VisionMeasurementResult(
                    status="VISION_OFFLINE",
                    optical_fill_fraction=None,
                    estimated_level_bbl=None,
                    pump_led_illuminated=False,
                    pump_state_detected="UNKNOWN",
                    confidence="LOW",
                    contour_area_pixels=0,
                    raw_frame_height=0,
                    raw_frame_width=0,
                    timestamp=now_iso,
                )

        h, w = frame.shape[:2]

        # 1. Perspective Warp to Rectangular Tank ROI
        pts1 = np.float32([
            self.corners.top_left,
            self.corners.top_right,
            self.corners.bottom_right,
            self.corners.bottom_left,
        ])
        target_w, target_h = 400, 400
        pts2 = np.float32([
            [0, 0],
            [target_w, 0],
            [target_w, target_h],
            [0, target_h],
        ])

        try:
            matrix = cv2.getPerspectiveTransform(pts1, pts2)
            warped = cv2.warpPerspective(frame, matrix, (target_w, target_h))
        except Exception:
            warped = cv2.resize(frame, (target_w, target_h))

        # 2. 5x5 Median Filter to Remove Lighting Glare & Meniscus Noise
        filtered = cv2.medianBlur(warped, 5)

        # 3. HSV Color Segmentation
        hsv = cv2.cvtColor(filtered, cv2.COLOR_BGR2HSV)
        mask = cv2.inRange(hsv, self.hsv_lower, self.hsv_upper)

        # Morphological Closing to Fill Internal Voids in Fluid Column
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7))
        closed_mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)

        # 4. Find Water Level via Segmented Column Height
        # Fluid sits at the bottom of the container; count vertical column profile
        vertical_profile = np.sum(closed_mask > 0, axis=1)  # sum along horizontal lines
        # Find the top of the fluid column from bottom to top
        fluid_rows = np.where(vertical_profile > (target_w * 0.15))[0]  # At least 15% line coverage

        if len(fluid_rows) > 0:
            top_row = np.min(fluid_rows)
            bottom_row = target_h
            fluid_pixel_height = max(0, bottom_row - top_row)
            fill_fraction = float(np.clip(fluid_pixel_height / float(target_h), 0.0, 1.0))
        else:
            fill_fraction = 0.0

        # 5. Detect Pump Indicator LED Status
        x1, y1, x2, y2 = self.led_roi
        x1 = min(w - 1, max(0, x1))
        x2 = min(w, max(x1 + 1, x2))
        y1 = min(h - 1, max(0, y1))
        y2 = min(h, max(y1 + 1, y2))
        led_crop = frame[y1:y2, x1:x2]

        if led_crop.size > 0:
            gray_crop = cv2.cvtColor(led_crop, cv2.COLOR_BGR2GRAY)
            led_max_val = float(np.max(gray_crop))
            led_active = led_max_val > 140.0
        else:
            led_active = False

        return VisionMeasurementResult(

            status="ONLINE",
            optical_fill_fraction=round(fill_fraction, 4),
            estimated_level_bbl=round(fill_fraction * 1000.0, 1),
            pump_led_illuminated=led_active,
            pump_state_detected="RUNNING" if led_active else "STOPPED",
            confidence="HIGH" if fill_fraction > 0.05 else "MEDIUM",
            contour_area_pixels=int(np.sum(closed_mask > 0)),
            raw_frame_height=h,
            raw_frame_width=w,
            timestamp=now_iso,
        )

    def generate_synthetic_test_frame(self, target_fill_fraction: float = 0.41, pump_led_on: bool = True) -> np.ndarray:
        """Generate a realistic test image of a rectangular clear tank with blue fluid for testing."""
        frame = np.ones((500, 500, 3), dtype=np.uint8) * 35  # Dark industrial ambient background

        # Draw tank container boundary (gray outline)
        cv2.rectangle(frame, (50, 50), (450, 450), (120, 120, 120), 4)

        # Draw dyed fluid column (Blue: BGR [220, 140, 20])
        tank_h = 400
        fluid_h = int(tank_h * target_fill_fraction)
        top_y = 450 - fluid_h
        if fluid_h > 0:
            cv2.rectangle(frame, (52, top_y), (448, 448), (220, 130, 20), -1)

        # Draw pump status indicator LED
        led_color = (0, 255, 0) if pump_led_on else (40, 40, 40)
        cv2.circle(frame, (432, 82), 8, led_color, -1)

        return frame

vision_service = OpenCVVisionService()
