export const buildCollectionTree = (collections) => {
    const collectionMap = {};
    const tree = [];

    collections.forEach((col) => {
        collectionMap[col.id] = { ...col, children: [] };
    });

    collections.forEach((col) => {
        if (col.parentCollectionId && collectionMap[col.parentCollectionId]) {
            collectionMap[col.parentCollectionId].children.push(
                collectionMap[col.id],
            );
        } else {
            tree.push(collectionMap[col.id]);
        }
    });

    return tree;
};