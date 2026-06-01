# 视频转码

把 SOURCE_LOCATION 目录里的 mp4 等视频文件，转码成为 OUTPUT_LOCATION 目录里的 m3u8 文件，同时支持以下功能：
- 支持不同分辨率的输出
- 生成动态封面图
- 生成时间线缩略图
- 生成中文字幕

## 设置必要参数

在 `.env` 文件里设置和修改：

注意：也可以通过命令行参数提供以下的参数

```
SOURCE_LOCATION = /path/to/input_dir
OUTPUT_LOCATION = /path/to/out_dir

# 注意：需要下载 faster-whisper python 包
INCLUDE_TRANSCRIPTION = true # true: 使用 faster whisper 转录并生成字幕(中文);

# 注意：如果源视频的分辨率小于提供的分辨率，那么提供的分辨率将会被忽略
RESOLUTIONS = 480 # 仅输出 480p 这一种分辨率
RESOLUTIONS = 720,480,360 # 输出 720/480/360p 三种分辨率
```

## (可选) 设置 faster-whisper

### 下载 faster-whisper
```bash
python3 -m venv venv # 创建 python 虚拟环境
. ./venv/bin/active # 激活 python 虚拟环境
pip install -r requirements.txt # 安装依赖
```

### 设置 device 类型

根据电脑的 GPU 类型，修改 `faster_whisper_cli.py` 里的 `device` 类型

```python
# NOTE:
# 在 NVIDIA 显卡的电脑上，您可以将 device 设置为 "cuda" 以利用 GPU 加速。
# (未测试) 在 macOS M系列芯片的电脑上，您可以将 device 设置为 "mps" 以利用 Apple Silicon 的加速功能。
# 如果 cuda / mps 不可用，或者您希望在 CPU 上运行，则可以将 device 设置为 "cpu"。
model = WhisperModel(model_size, device="cpu", compute_type="int8")
```

## 转码

```bash
# 使用 .env 里面的环境变量
node ace run:transcoder

# 使用 shell 环境变量覆盖 .env 里的变量
SOURCE_LOCATION=/path/to/input_dir OUTPUT_LOCATION=/path/to/out_dir INCLUDE_TRANSCRIPTION=false RESOLUTIONS=480,360 node ace run:transcoder
```