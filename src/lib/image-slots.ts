import type { ImageGroupCols } from "@/lib/image-group";

export const MAX_IMAGE_GROUP_SIZE = 4;

export type SlotImage = {
  id: string;
  imageUrl: string;
  caption: string | null;
  orderIndex: number;
  groupId?: string | null;
};

export type ImageSlot =
  | { kind: "single"; id: string; image: SlotImage }
  | { kind: "group"; id: string; groupId: string; images: SlotImage[] };

/** Build display slots from flat ordered images (group members stay contiguous). */
export function imagesToSlots(images: SlotImage[]): ImageSlot[] {
  const sorted = [...images].sort((a, b) => a.orderIndex - b.orderIndex);
  const slots: ImageSlot[] = [];
  const seenGroups = new Set<string>();

  for (const image of sorted) {
    const gid = image.groupId?.trim() || null;
    if (!gid) {
      slots.push({ kind: "single", id: image.id, image });
      continue;
    }
    if (seenGroups.has(gid)) continue;
    seenGroups.add(gid);
    const members = sorted.filter((img) => img.groupId === gid).slice(0, MAX_IMAGE_GROUP_SIZE);
    if (members.length <= 1) {
      slots.push({ kind: "single", id: members[0].id, image: { ...members[0], groupId: null } });
    } else {
      slots.push({ kind: "group", id: `group-${gid}`, groupId: gid, images: members });
    }
  }
  return slots;
}

export function slotsToOrderedIds(slots: ImageSlot[]): string[] {
  return slots.flatMap((slot) =>
    slot.kind === "single" ? [slot.image.id] : slot.images.map((img) => img.id),
  );
}

export function slotsToLayoutPayload(slots: ImageSlot[]) {
  return {
    slots: slots.map((slot) =>
      slot.kind === "single"
        ? { type: "single" as const, imageIds: [slot.image.id] }
        : { type: "group" as const, imageIds: slot.images.map((img) => img.id) },
    ),
  };
}

/** Merge dragged slot onto target slot. Returns null if invalid (e.g. over capacity). */
export function mergeSlots(slots: ImageSlot[], fromId: string, ontoId: string): ImageSlot[] | null {
  if (fromId === ontoId) return null;
  const fromIndex = slots.findIndex((s) => s.id === fromId);
  const ontoIndex = slots.findIndex((s) => s.id === ontoId);
  if (fromIndex < 0 || ontoIndex < 0) return null;

  const from = slots[fromIndex];
  const onto = slots[ontoIndex];
  const fromImages = from.kind === "single" ? [from.image] : from.images;
  const ontoImages = onto.kind === "single" ? [onto.image] : onto.images;
  const mergedImages = [...ontoImages, ...fromImages];
  if (mergedImages.length > MAX_IMAGE_GROUP_SIZE) return null;

  const groupId =
    onto.kind === "group"
      ? onto.groupId
      : from.kind === "group"
        ? from.groupId
        : `tmp-${onto.image.id}`;

  const next = slots.filter((_, i) => i !== fromIndex);
  const targetIndex = next.findIndex((s) => s.id === ontoId);
  if (targetIndex < 0) return null;

  next[targetIndex] = {
    kind: "group",
    id: `group-${groupId}`,
    groupId,
    images: mergedImages.map((img, orderIndex) => ({ ...img, groupId, orderIndex })),
  };
  return next;
}

/** Merge several slots into one group placed at the end. Returns null if invalid. */
export function mergeSlotsIntoNewGroup(slots: ImageSlot[], slotIds: string[]): ImageSlot[] | null {
  const uniqueIds = [...new Set(slotIds)];
  if (uniqueIds.length < 1) return null;

  const selected: ImageSlot[] = [];
  for (const id of uniqueIds) {
    const slot = slots.find((s) => s.id === id);
    if (!slot) return null;
    selected.push(slot);
  }

  const mergedImages = selected.flatMap((slot) =>
    slot.kind === "single" ? [slot.image] : slot.images,
  );
  if (mergedImages.length < 2 || mergedImages.length > MAX_IMAGE_GROUP_SIZE) return null;

  const groupId =
    selected.find((s): s is Extract<ImageSlot, { kind: "group" }> => s.kind === "group")?.groupId ||
    `tmp-${mergedImages[0].id}`;

  const remove = new Set(uniqueIds);
  const next = slots.filter((slot) => !remove.has(slot.id));
  next.push({
    kind: "group",
    id: `group-${groupId}`,
    groupId,
    images: mergedImages.map((img, orderIndex) => ({ ...img, groupId, orderIndex })),
  });
  return next;
}

/** Append image ids as a new group (or singles) after existing layout. */
export function appendImagesAsGroup(
  existing: SlotImage[],
  uploaded: SlotImage[],
  asGroup: boolean,
): ReturnType<typeof slotsToLayoutPayload> {
  const base = imagesToSlots(existing.filter((img) => !uploaded.some((u) => u.id === img.id)));
  if (asGroup && uploaded.length >= 2) {
    const groupId = `tmp-${uploaded[0].id}`;
    const groupSlot: ImageSlot = {
      kind: "group",
      id: `group-${groupId}`,
      groupId,
      images: uploaded.slice(0, MAX_IMAGE_GROUP_SIZE).map((img, orderIndex) => ({
        ...img,
        groupId,
        orderIndex,
      })),
    };
    return slotsToLayoutPayload([...base, groupSlot]);
  }
  const singles: ImageSlot[] = uploaded.map((img) => ({
    kind: "single",
    id: img.id,
    image: { ...img, groupId: null },
  }));
  return slotsToLayoutPayload([...base, ...singles]);
}

/** Attach images (by id) onto a target slot, forming/expanding a group. */
export function attachToSlotLayout(
  images: SlotImage[],
  targetSlotId: string,
  addImageIds: string[],
): ReturnType<typeof slotsToLayoutPayload> | null {
  const slots = imagesToSlots(images);
  const ontoIndex = slots.findIndex((s) => s.id === targetSlotId);
  if (ontoIndex < 0) return null;

  const onto = slots[ontoIndex];
  const ontoImages = onto.kind === "single" ? [onto.image] : onto.images;
  const ontoIdSet = new Set(ontoImages.map((img) => img.id));
  const addUnique = [...new Set(addImageIds)].filter((id) => !ontoIdSet.has(id));
  if (!addUnique.length) return slotsToLayoutPayload(slots);

  const addImages = addUnique
    .map((id) => images.find((img) => img.id === id))
    .filter((img): img is SlotImage => Boolean(img));
  if (addImages.length !== addUnique.length) return null;

  const merged = [...ontoImages, ...addImages];
  if (merged.length > MAX_IMAGE_GROUP_SIZE) return null;

  const consumed = new Set(addUnique);
  const next: ImageSlot[] = [];

  for (let i = 0; i < slots.length; i += 1) {
    if (i === ontoIndex) {
      if (merged.length === 1) {
        next.push({
          kind: "single",
          id: merged[0].id,
          image: { ...merged[0], groupId: null },
        });
      } else {
        const groupId = onto.kind === "group" ? onto.groupId : `tmp-${merged[0].id}`;
        next.push({
          kind: "group",
          id: `group-${groupId}`,
          groupId,
          images: merged.map((img, orderIndex) => ({ ...img, groupId, orderIndex })),
        });
      }
      continue;
    }

    const slot = slots[i];
    if (slot.kind === "single") {
      if (consumed.has(slot.image.id)) continue;
      next.push(slot);
      continue;
    }

    const remaining = slot.images.filter((img) => !consumed.has(img.id));
    if (!remaining.length) continue;
    if (remaining.length === 1) {
      next.push({
        kind: "single",
        id: remaining[0].id,
        image: { ...remaining[0], groupId: null },
      });
    } else {
      next.push({
        kind: "group",
        id: slot.id,
        groupId: slot.groupId,
        images: remaining.map((img, orderIndex) => ({
          ...img,
          groupId: slot.groupId,
          orderIndex,
        })),
      });
    }
  }

  return slotsToLayoutPayload(next);
}

export function slotImageCount(slot: ImageSlot) {
  return slot.kind === "single" ? 1 : slot.images.length;
}

/** Move slot fromIndex to toIndex (reorder). */
export function moveSlot(slots: ImageSlot[], fromId: string, toIndex: number): ImageSlot[] {
  const fromIndex = slots.findIndex((s) => s.id === fromId);
  if (fromIndex < 0) return slots;
  const next = [...slots];
  const [removed] = next.splice(fromIndex, 1);
  const clamped = Math.max(0, Math.min(toIndex, next.length));
  next.splice(clamped, 0, removed);
  return next;
}

export function ungroupSlot(slots: ImageSlot[], groupSlotId: string): ImageSlot[] {
  const index = slots.findIndex((s) => s.id === groupSlotId && s.kind === "group");
  if (index < 0) return slots;
  const group = slots[index];
  if (group.kind !== "group") return slots;
  const singles: ImageSlot[] = group.images.map((image) => ({
    kind: "single",
    id: image.id,
    image: { ...image, groupId: null },
  }));
  return [...slots.slice(0, index), ...singles, ...slots.slice(index + 1)];
}

export function groupColsForCount(count: number): ImageGroupCols {
  return count >= 3 ? 3 : 2;
}
