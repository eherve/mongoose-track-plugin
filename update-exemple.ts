/** @format */

// 1. Modification d'un champ avec $set
// L’opérateur $set remplace ou définit une valeur d'un champ pour tous les documents qui satisfont la condition.
db.collection('users').updateMany(
  { age: { $gte: 18 } }, // Condition de sélection : utilisateurs de 18 ans ou plus
  { $set: { status: 'adult' } } // Met à jour le champ 'status' à 'adult'
);

// 2. Incrémentation d'un champ numérique avec $inc
// L’opérateur $inc incrémente ou décrémente une valeur numérique d’un champ spécifié.
db.collection('products').updateMany(
  { stock: { $gte: 10 } }, // Condition : produits dont le stock est supérieur ou égal à 10
  { $inc: { stock: -5 } } // Diminue le stock de 5 pour les produits sélectionnés
);

// 3. Ajouter un élément à un tableau avec $push
// L’opérateur $push ajoute un élément à un tableau, s'il existe.
db.collection('students').updateMany(
  { grade: { $gte: 90 } }, // Sélectionner les étudiants ayant une note >= 90
  { $push: { awards: 'Honor Roll' } } // Ajouter 'Honor Roll' à la liste des récompenses
);

// 4. Ajouter plusieurs éléments à un tableau avec $push et $each
// Utilisez l'option $each pour ajouter plusieurs éléments à un tableau.
db.collection('students').updateMany(
  { grade: { $gte: 90 } }, // Sélectionner les étudiants ayant une note >= 90
  { $push: { awards: { $each: ["Dean's List", 'Scholarship'] } } } // Ajouter plusieurs éléments au tableau
);

// 5. Retirer un élément d'un tableau avec $pull
// L’opérateur $pull supprime un ou plusieurs éléments d'un tableau qui satisfont une condition donnée.
db.collection('students').updateMany(
  { grade: { $lt: 60 } }, // Sélectionner les étudiants ayant une note inférieure à 60
  { $pull: { awards: 'Probation' } } // Retirer 'Probation' du tableau des récompenses
);

// 6. Supprimer un champ avec $unset
// L’opérateur $unset supprime un champ d’un document.
db.collection('users').updateMany(
  { lastLogin: { $lt: new Date('2020-01-01') } }, // Utilisateurs inactifs depuis 2020
  { $unset: { phoneNumber: '' } } // Supprimer le champ 'phoneNumber'
);

// 7. Remplacer un champ avec $rename
// L’opérateur $rename permet de renommer un champ dans tous les documents sélectionnés.
db.collection('employees').updateMany(
  { department: 'HR' }, // Sélectionner les employés du département HR
  { $rename: { department: 'humanResources' } } // Renommer 'department' en 'humanResources'
);

// 8. Modification conditionnelle avec $mul
// L’opérateur $mul permet de multiplier la valeur d’un champ numérique par un facteur.
db.collection('employees').updateMany(
  { salary: { $lt: 3000 } }, // Sélectionner les employés dont le salaire est inférieur à 3000
  { $mul: { salary: 1.1 } } // Augmenter leur salaire de 10% (multiplication par 1.1)
);

// 9. Utilisation de l’opérateur $set avec un tableau ou un objet
// Si vous souhaitez définir un champ sur un tableau ou un objet, vous pouvez aussi le faire avec $set.
db.collection('employees').updateMany(
  { department: 'Sales' }, // Sélectionner les employés du département 'Sales'
  { $set: { address: { street: '123 Market St', city: 'Metropolis' } } } // Remplacer l'adresse par un objet
);

// 10. Modification avec des opérateurs logiques comme $or, $and, etc.
// Vous pouvez combiner des conditions avec des opérateurs logiques.
db.collection('users').updateMany(
  { $or: [{ age: { $lt: 18 } }, { status: 'inactive' }] }, // Utilisateur ayant moins de 18 ans ou statut 'inactive'
  { $set: { status: 'active' } } // Mettre à jour leur statut à 'active'
);

// 11. Mise à jour avec un tableau d'opérations (utilisation de updateMany avec un tableau d'opérations)
// Cette fonctionnalité est utilisée pour appliquer des transformations complexes avec l’opérateur updateMany.
db.collection('orders').updateMany(
  { status: 'pending' }, // Condition : commandes avec statut 'pending'
  [
    { $set: { status: 'processed' } }, // Changer le statut à 'processed'
    { $set: { updatedAt: new Date() } }, // Ajouter un champ 'updatedAt' avec la date actuelle
  ]
);

// 12. Mise à jour basée sur un champ du document ($currentDate)
// Utilisez $currentDate pour définir un champ sur la date actuelle.
db.collection('logs').updateMany(
  { status: 'active' }, // Sélectionner les documents où le statut est 'active'
  { $currentDate: { lastModified: true } } // Met à jour le champ 'lastModified' avec la date actuelle
);

// 13. Mise à jour d'un champ basé sur l'état actuel de l'objet avec $cond
// Vous pouvez aussi utiliser des expressions conditionnelles dans les mises à jour.
db.collection('products').updateMany(
  { inStock: true }, // Sélectionner les produits en stock
  [
    {
      $set: {
        price: {
          $cond: { if: { $gte: ['$price', 100] }, then: { $multiply: ['$price', 0.9] }, else: '$price' },
        },
      },
    },
  ]
);

// 14. Mettre à jour un élément spécifique d’un tableau d'objets avec $set et arrayFilters
// Cet exemple met à jour un objet dans un tableau d'objets où une certaine condition est remplie (par exemple, un utilisateur ayant un status égal à "inactive").
db.collection('users').updateOne(
  { username: 'john_doe' }, // Condition pour sélectionner l'utilisateur
  {
    $set: { 'contacts.$[contact].status': 'active' }, // Mettre à jour le statut de 'contacts'
  },
  {
    arrayFilters: [{ 'contact.status': 'inactive' }], // Condition pour cibler les contacts avec 'inactive' comme statut
  }
);

// 15. Mettre à jour plusieurs éléments dans un tableau d’objets avec $set et arrayFilters
// Cet exemple montre comment modifier plusieurs éléments dans un tableau d'objets en utilisant des arrayFilters.
db.collection('users').updateOne(
  { username: 'john_doe' }, // Condition pour sélectionner l'utilisateur
  {
    $set: { 'contacts.$[contact].email': 'new_email@example.com' }, // Mise à jour de l'email dans le tableau 'contacts'
  },
  {
    arrayFilters: [{ 'contact.status': 'inactive' }], // Cibler les contacts ayant un statut 'inactive'
  }
);

// 16. Incrémenter un champ dans un tableau d’objets avec $inc et arrayFilters
// Dans cet exemple, on incrémente un champ numérique dans un tableau d'objets, en utilisant des arrayFilters pour sélectionner un élément particulier.
db.collection('users').updateOne(
  { username: 'john_doe' }, // Sélectionner un utilisateur spécifique
  {
    $inc: { 'contacts.$[contact].points': 10 }, // Incrémenter les 'points' de 10 pour un contact spécifique
  },
  {
    arrayFilters: [{ 'contact.status': 'active' }], // Sélectionner les contacts ayant un statut 'active'
  }
);

// 17. Supprimer un élément d’un tableau avec $pull et arrayFilters
// Dans cet exemple, on utilise l’opérateur $pull pour supprimer un élément d’un tableau d’objets en fonction d’une condition spécifique.
db.collection('users').updateOne(
  { username: 'john_doe' }, // Condition pour sélectionner l'utilisateur
  {
    $pull: { contacts: { status: 'inactive' } }, // Retirer tous les contacts ayant un statut 'inactive'
  },
  {
    arrayFilters: [{ 'contact.status': 'inactive' }], // Spécifie la condition pour cibler le bon élément du tableau
  }
);

// 18. Ajouter un nouvel élément à un tableau à une position spécifique avec $push et arrayFilters
// Cet exemple montre comment ajouter un nouvel élément à un tableau en fonction d'un critère, mais en utilisant arrayFilters pour cibler l'élément où ajouter l'élément.
db.collection('users').updateOne(
  { username: 'john_doe' }, // Condition pour sélectionner l'utilisateur
  {
    $push: {
      'contacts.$[contact].messages': 'New message', // Ajouter un message à un contact spécifique
    },
  },
  {
    arrayFilters: [{ 'contact.status': 'active' }], // Sélectionner les contacts ayant un statut 'active'
  }
);

// 19. Mettre à jour un champ dans un tableau d'objets avec $set et arrayFilters pour un tableau d'objets imbriqué
// Si vous avez un tableau imbriqué, vous pouvez aussi utiliser arrayFilters pour cibler un élément à l'intérieur d'un objet dans un tableau.
db.collection('users').updateOne(
  { username: 'john_doe' }, // Condition pour sélectionner l'utilisateur
  {
    $set: { 'contacts.$[contact].address.city': 'New York' }, // Mettre à jour la ville dans l'adresse d'un contact spécifique
  },
  {
    arrayFilters: [{ 'contact.status': 'active' }], // Cibler les contacts ayant un statut 'active'
  }
);

// 20. Mettre à jour un champ dans un tableau d’objets avec $set et arrayFilters dans un tableau imbriqué
// Ici, vous ciblez un élément d'un tableau d'objets imbriqué et mettez à jour un champ spécifique à l'intérieur de l'objet imbriqué.
db.collection('users').updateOne(
  { username: 'john_doe' }, // Condition pour sélectionner l'utilisateur
  {
    $set: { 'contacts.$[contact].address.$[address].zipCode': '10001' }, // Mise à jour du code postal dans l'adresse du contact
  },
  {
    arrayFilters: [
      { 'contact.status': 'active' }, // Sélectionner les contacts avec un statut 'active'
      { 'address.type': 'billing' }, // Sélectionner l'adresse de type 'billing'
    ],
  }
);

// 21. Supprimer un élément spécifique dans un tableau d’objets avec $pull et arrayFilters
// Cet exemple montre comment supprimer un élément particulier dans un tableau d'objets en fonction d'une condition spécifique.
db.collection('users').updateOne(
  { username: 'john_doe' }, // Condition pour sélectionner l'utilisateur
  {
    $pull: {
      contacts: { phoneNumber: '123-456-7890' }, // Supprimer un contact avec un numéro spécifique
    },
  },
  {
    arrayFilters: [{ 'contact.status': 'inactive' }], // Appliquer à des contacts inactifs uniquement
  }
);

// 22. Mettre à jour un élément dans un tableau de nombres avec $set et arrayFilters
// Si vous avez un tableau contenant des nombres et que vous souhaitez mettre à jour un nombre spécifique basé sur une condition :
db.collection('users').updateOne(
  { username: 'john_doe' }, // Condition pour sélectionner l'utilisateur
  {
    $set: { 'contacts.$[contact].points': 100 }, // Mettre à jour les points d'un contact
  },
  {
    arrayFilters: [{ 'contact.points': { $lt: 50 } }], // Cibler les contacts avec moins de 50 points
  }
);
