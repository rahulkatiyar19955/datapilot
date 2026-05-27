from typing import Dict, List, Any

class TFParser:
    def __init__(self):
        # Maps child frame to parent frame
        self.frames: Dict[str, str] = {}

    def parse_tf_message(self, msg: Any):
        """
        Parses a tf2_msgs/msg/TFMessage or similar structure.
        Looks for child_frame_id and header.frame_id (parent).
        """
        try:
            # Handles dictionary format or object attributes
            transforms = getattr(msg, "transforms", [])
            if not transforms and isinstance(msg, dict):
                transforms = msg.get("transforms", [])
                
            for transform in transforms:
                child = getattr(transform, "child_frame_id", None)
                if not child and isinstance(transform, dict):
                    child = transform.get("child_frame_id")
                
                header = getattr(transform, "header", None)
                parent = None
                if header:
                    parent = getattr(header, "frame_id", None)
                elif isinstance(transform, dict):
                    parent = transform.get("header", {}).get("frame_id")
                
                if child and parent:
                    # Clean up slash prefixes if any
                    child = child.lstrip("/")
                    parent = parent.lstrip("/")
                    self.frames[child] = parent
        except Exception:
            pass

    def get_frames_list(self) -> List[Dict[str, str]]:
        return [{"name": child, "parent": parent} for child, parent in self.frames.items()]
