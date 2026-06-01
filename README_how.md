# 视频转码

把 SOURCE_LOCATION 目录里的 mp4 等视频文件，转码成为 OUTPUT_LOCATION 目录里的 m3u8 文件，同时支持以下功能：
- 支持不同分辨率的输出
- 生成动态封面图
- 生成时间线缩略图
- 生成中文字幕(尽量使用 NVIDIA 显卡的电脑，否则速度可能很慢)

## 安装 ffmpeg

依赖在本地可以使用 CLI 操作 ffmpeg，所以需要安装 ffmpeg

```bash
# Linux 为例
sudo apt update
sudo apt install ffmpeg
```

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

# ffmpeg 视频链路（转码 + 压缩）使用的 GPU 模式
# auto: 自动探测最优后端，失败则回退到 CPU
# cpu: 强制软件编码
# nvidia: 强制 NVENC
# amd: 强制 VAAPI
# apple-m / apple-intel: 都使用 VideoToolbox
GPU = auto

FORCE_CPU_DEVICE = false
```

## (可选)下载安装 faster-whisper

如果要转录中文字幕，则需要安装 faster-whisper

```bash
python3 -m venv venv # 创建 python 虚拟环境
. ./venv/bin/activate # 激活 python 虚拟环境
pip install -r requirements.txt # 安装依赖，只需执行一次
```

如果是 NVIDIA 显卡，还需要安装 CUDA Toolkit 12: https://developer.nvidia.com/cuda-12-0-0-download-archive
如果不需要显卡加速，则设置 `FORCE_CPU_DEVICE = true`

## 开始转码

如果需要使用 NVIDIA 显卡加速字幕转录，则需要设置以下环境变量（注意更改 `/path/to/video_transcoder/venv/lib/python3.12` 为实际的路径）
```
export LD_LIBRARY_PATH=/path/to/video_transcoder/venv/lib/python3.12/site-packages/nvidia/cublas/lib:/path/to/video_transcoder/venv/lib/python3.12/site-packages/nvidia/cudnn/lib:$LD_LIBRARY_PATH
```

```bash
# 使用 .env 里面的环境变量
node ace run:transcoder

# 使用 shell 环境变量覆盖 .env 里的变量
SOURCE_LOCATION=/path/to/input_dir OUTPUT_LOCATION=/path/to/out_dir INCLUDE_TRANSCRIPTION=false RESOLUTIONS=480,360 node ace run:transcoder
```