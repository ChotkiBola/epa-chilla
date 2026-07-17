#!/usr/bin/env bash
# EPA Chilla — video encoder
#
# Usage:   ./scripts/encode.sh master.mp4 chilla-offer           # top rung 1280
#          MAXH=1920 ./scripts/encode.sh master.mp4 chilla-offer # crisp, costly
#
# From a vertical master, builds an HLS ladder capped at MAXH, never upscaling.
# 25fps, 10s segments, plus an MP4 fallback and a poster.
#
# WHY MAXH DEFAULTS TO 1280, NOT 1920 -------------------------------------
# Output lands in public/videos/<slug>/, which Vercel serves. Vercel Hobby
# allows 100 GB/month and PAUSES the project for 30 days past it — with the QR
# codes already printed. Measured against an 80s clip, per full session
# (both videos, top rung):
#
#   MAXH=1920  ~3800 kbps  ~37 MB/view  ~74 MB/session  ~1,400 sessions
#   MAXH=1280  ~1800 kbps  ~18 MB/view  ~35 MB/session  ~2,900 sessions
#   MAXH=854   ~900 kbps   ~9 MB/view   ~18 MB/session  ~5,700 sessions
#
# 1280 is the compromise: visibly crisper than the 854 ladder that shipped,
# without halving the number of scans the campaign survives. Raise it to 1920
# only if you know the scan volume is low, or the videos have moved to a CDN
# that bills per GB instead of pausing.
# -------------------------------------------------------------------------

set -euo pipefail

IN="${1:?usage: ./scripts/encode.sh <input.mp4> <slug>}"
SLUG="${2:?usage: ./scripts/encode.sh <input.mp4> <slug>}"
MAXH="${MAXH:-1280}"

command -v ffmpeg  >/dev/null || { echo "ffmpeg not found"  >&2; exit 1; }
command -v ffprobe >/dev/null || { echo "ffprobe not found" >&2; exit 1; }
[ -f "$IN" ] || { echo "no such file: $IN" >&2; exit 1; }
case "$SLUG" in
  # The slug becomes a URL path segment and a folder name. Keep it boring.
  [a-z0-9]*[a-z0-9]|[a-z0-9]) ;;
  *) echo "slug must be lowercase alphanumeric/hyphen: $SLUG" >&2; exit 1;;
esac

OUT="public/videos/$SLUG"
mkdir -p "$OUT" public/posters
rm -f "$OUT"/*.m3u8 "$OUT"/*.ts "$OUT"/fallback.mp4

# NOT `-of csv=p=0`. iPhone/MOV video streams carry a [SIDE_DATA] block (the
# display-rotation matrix), which csv emits as an extra empty field — so the
# height comes back as "854," and the arithmetic below dies with
# "syntax error: operand expected". ffprobe on Windows also emits CRLF, hence
# the tr. `default=nw=1:nk=1` prints the bare value.
H=$(ffprobe -v error -select_streams v:0 -show_entries stream=height \
      -of default=nw=1:nk=1 "$IN" | head -1 | tr -d '\r')
case "$H" in
  ''|*[!0-9]*) echo "could not read a numeric height from $IN (got '$H')" >&2; exit 1;;
esac
TOP=$(( H < MAXH ? H : MAXH ))
echo "==> source ${H}px, top rung ${TOP}px"

# Numeric, not string-prefix. The original matched on leading digits
# (`19*|18*`, `12*|13*`, `8*|9*|10*|11*`), which is right only for the four
# default heights and silently wrong elsewhere: 1600 and 1440 both fell to the
# `*` catch-all at 500 kbps, and 1080 matched `10*` at 900 kbps.
rung_bitrate() {
  local h=$1
  if   [ "$h" -ge 1800 ]; then echo 3800
  elif [ "$h" -ge 1400 ]; then echo 2600
  elif [ "$h" -ge 1200 ]; then echo 1800
  elif [ "$h" -ge 1000 ]; then echo 1300
  elif [ "$h" -ge 800  ]; then echo 900
  elif [ "$h" -ge 600  ]; then echo 500
  else                        echo 350
  fi
}

# Rungs under the top, skipping any that would upscale or duplicate.
LADDER_H=("$TOP")
LADDER_B=("$(rung_bitrate "$TOP")")
for CAND in 1280 854 640; do
  if [ "$CAND" -lt "$TOP" ]; then
    LADDER_H+=("$CAND")
    LADDER_B+=("$(rung_bitrate "$CAND")")
  fi
done
N=${#LADDER_H[@]}
echo "==> ladder: ${LADDER_H[*]} px @ ${LADDER_B[*]} kbps"

# A master with no audio track makes `-map a:0` a hard failure.
HAS_AUDIO=$(ffprobe -v error -select_streams a:0 -show_entries stream=index \
              -of default=nw=1:nk=1 "$IN" 2>/dev/null | head -1 | tr -d '\r' || true)
[ -n "$HAS_AUDIO" ] || echo "==> no audio track — encoding video only"

SPLIT=""
for i in $(seq 0 $((N-1))); do SPLIT="${SPLIT}[v$i]"; done
FC="[0:v]fps=25,split=${N}${SPLIT};"
for i in $(seq 0 $((N-1))); do
  FC="${FC}[v$i]scale=-2:${LADDER_H[$i]}[v${i}out];"
done
FC="${FC%;}"

MAPS=()
for i in $(seq 0 $((N-1))); do
  B=${LADDER_B[$i]}
  MAPS+=( -map "[v${i}out]" -c:v:$i libx264 -b:v:$i "${B}k" \
          -maxrate:v:$i "$((B*12/10))k" -bufsize:v:$i "$((B*17/10))k" )
done

VSM=""
if [ -n "$HAS_AUDIO" ]; then
  for _ in $(seq 0 $((N-1))); do MAPS+=( -map a:0 ); done
  MAPS+=( -c:a aac -b:a 96k -ac 2 )
  for i in $(seq 0 $((N-1))); do VSM="${VSM}v:$i,a:$i,name:${LADDER_H[$i]}p "; done
else
  MAPS+=( -an )
  for i in $(seq 0 $((N-1))); do VSM="${VSM}v:$i,name:${LADDER_H[$i]}p "; done
fi

# -g 50 with fps=25 puts a keyframe every 2s, so 10s segments cut cleanly.
ffmpeg -hide_banner -y -i "$IN" \
  -filter_complex "$FC" \
  "${MAPS[@]}" \
  -preset slow -profile:v high -pix_fmt yuv420p \
  -g 50 -keyint_min 50 -sc_threshold 0 \
  -hls_time 10 -hls_playlist_type vod -hls_flags independent_segments \
  -hls_segment_filename "$OUT/seg_%v_%03d.ts" \
  -master_pl_name master.m3u8 \
  -var_stream_map "${VSM% }" \
  "$OUT/%v.m3u8"

echo "==> MP4 fallback"
AUDIO_ARGS=( -an )
[ -n "$HAS_AUDIO" ] && AUDIO_ARGS=( -c:a aac -b:a 96k -ac 2 )
ffmpeg -hide_banner -y -i "$IN" -vf "fps=25,scale=-2:854" \
  -c:v libx264 -preset slow -crf 28 -profile:v main -pix_fmt yuv420p \
  "${AUDIO_ARGS[@]}" -movflags +faststart "$OUT/fallback.mp4"

echo "==> poster (frame at 1s) — replace by hand if you have a designed one"
# Do not take frame 0: clips that fade in from white give you a blank poster,
# which is exactly what happened to placeholder-2.
ffmpeg -hide_banner -y -ss 00:00:01 -i "$IN" -frames:v 1 \
  -vf "scale=-2:1600" -q:v 4 "public/posters/$SLUG.jpg"

# ---- report -------------------------------------------------------------
# Everything below is advisory. `set -o pipefail` turns a failing `du` (e.g. a
# glob that matched nothing) into a script-wide failure, which would report a
# perfectly good encode as broken — so each measurement swallows its own error.
DUR=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$IN" 2>/dev/null \
        | head -1 | tr -d '\r' | cut -d. -f1 || true)
case "$DUR" in ''|*[!0-9]*) DUR=80;; esac
echo
echo "--- One viewer downloads (per rung):"
for i in $(seq 0 $((N-1))); do
  name="${LADDER_H[$i]}p"
  size=$( { du -ch "$OUT"/seg_"${name}"_*.ts 2>/dev/null || true; } | tail -1 | cut -f1 || true)
  printf "    %-7s %s\n" "$name:" "${size:-n/a}"
done
FB=$( { du -h "$OUT/fallback.mp4" 2>/dev/null || true; } | cut -f1 || true)
echo "    fallback.mp4: ${FB:-n/a}"
REPO=$( { du -sh "$OUT" 2>/dev/null || true; } | cut -f1 || true)
echo "--- Repo cost: ${REPO:-n/a}"

TOPB=${LADDER_B[0]}
awk -v b="$TOPB" -v d="${DUR:-80}" 'BEGIN{
  mb = b*d/8/1024;
  printf "--- Top rung is %.0f MB per view; both videos = %.0f MB per session.\n", mb, mb*2;
  printf "    Vercel Hobby 100GB => about %d sessions before the project pauses.\n", (100*1024)/(mb*2);
  if (mb*2 > 40) print "    ^ Consider MAXH=1280 (or Bunny Stream) before printing more QR codes.";
}'
